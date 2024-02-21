
import sanitize from 'mongo-sanitize'
import { Judge } from "../judge/judgeInstance.js";
import clientPromise from '../lib/db_connection.js';
import { Redis } from 'ioredis'

export const config = {
  api: {
    bodyParser: false,
  },
};

const redisclient = new Redis()


const JudgePage = async (socket) => {
  let judgeInstance
  let client = await clientPromise
  let db =client.db()

  socket.on('feed', async msg => {

    const data = await db.collection('problems').find({ ProblemCode: parseInt(sanitize(socket.data.prob_id)) }).toArray()
    const { TimeLimit, SupportedLang, Mem, ProblemCode, isSpecialJudge, TestProgress } = JSON.parse(JSON.stringify(data[0]))

    if (SupportedLang.indexOf(msg.lang) == -1) {
      await redisclient.del(socket.data.uid)
      socket.emit('error', "unsupported language")
      socket.disconnect()
      return
    }

    let isCorrect
    let databaseTCdata
    let isSuccess

    try {
      judgeInstance = new Judge(msg.lang, Mem, 600000, isSpecialJudge)
      let isJudgeEnvCreated = await judgeInstance.CreateRunEnv(msg.codeData, TestProgress["SpecialJudge"])
      if(!isJudgeEnvCreated) {
        await redisclient.del(socket.data.uid)
        socket.emit("error", "failed creating judge environment")
        socket.disconnect()
        return
      }
      socket.emit("compile_start", "")
      await judgeInstance.compileCode()
      socket.emit("compile_end", "")

      const matchedCases = await judgeInstance.testCode(TimeLimit, ProblemCode, (a, b) => socket.emit("judge_progress", [a, b]))
      isCorrect = matchedCases.every(e => e.matched)

      databaseTCdata = matchedCases.map((elem) => {
        return { Mem: elem.memory, Time: elem.exect, State: elem.tle ? "TLE" : elem.matched ? "AC" : "AW" }
      })

      await db.collection('submissions').insertOne({
        User: socket.data.uid,
        Code: sanitize(msg.codeData),
        Status: isCorrect ? 'AC' : 'AW',
        CodeLength: msg.codeData.length,
        TC: databaseTCdata,
        Prob: parseInt(sanitize(socket.data.prob_id)),
        SubCode: socket.data.sub_code,
        Lang: msg.lang,
        Time: new Date()
      })
      isSuccess = true

    } catch (e) {
      if(["Runtime error", "Compile error"].indexOf(e.message)==-1) {
        await redisclient.del(socket.data.uid)
        socket.emit("error", "unknown")
        socket.disconnect()
        return
      }
      await db.collection('submissions').insertOne({
        User: socket.data.uid,
        Code: sanitize(msg.codeData),
        Status: e.message == "Compile error" ? "CE" : "ISE",
        CodeLength: msg.codeData.length,
        Prob: parseInt(sanitize(socket.data.prob_id)),
        SubCode: socket.data.sub_code,
        TC: [],
        Lang: msg.lang,
        Time: new Date()
      })
      isSuccess = false
    }


    await redisclient.del(socket.data.uid)
    const updateOperations = [];

    updateOperations.push({
      updateOne: {
        filter: { Uid: socket.data.uid },
        update: { $addToSet: { Submitted: ProblemCode } }
      }
    });

    if (isCorrect) {
      updateOperations.push({
        updateOne: {
          filter: { Uid: socket.data.uid },
          update: { $addToSet: { Solved: ProblemCode } }
        }
      });
    }

    const result = await db.collection('users').bulkWrite(updateOperations);

    if (result.modifiedCount > 0) {
      const updatedProblem = await db.collection('problems').findOne({ ProblemCode: ProblemCode }, "-_id submitted solved");
      let calculatedRating = Math.ceil(9 * (1 - (updatedProblem["solved"] / (updatedProblem["submitted"] + 1)) ** 2))
      let rating = updatedProblem["solved"] == 0 ? 10 : calculatedRating < 0 ? 1 : calculatedRating
      await db.collection('problems').updateOne({ ProblemCode: ProblemCode }, { $inc: { submitted: 1 }, $set:{rating: rating} });
      if (isCorrect) {
        await db.collection('problems').updateOne({ ProblemCode: ProblemCode }, { $inc: { solved: 1 } });
      }
    }

    await judgeInstance.Terminate()

    socket.emit("success", socket.data.sub_code)
    socket.disconnect()
  })

  socket.on('error', async (ex) => {
    console.log(ex);
    try {
      await judgeInstance.Terminate()
    } catch (e) { console.log("unable to end container or container is not generated") }
    socket.disconnect()
  });
  socket.on('disconnect', async () => {
    if(judgeInstance) {
      await judgeInstance.Terminate()
    }
  })
}


export default JudgePage