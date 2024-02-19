
import sanitize from 'mongo-sanitize'
import UserModel from "../schema/userSchema.js"
import ProblemModel from "../schema/problemSchema.js"
import SubmissionSchema from '../schema/submissionSchema.js'
import { Judge } from "../judge/judgeInstance.js";

import { Redis } from 'ioredis'

export const config = {
  api: {
    bodyParser: false,
  },
};

const client = new Redis()


const JudgePage = async (socket) => {
  let judgeInstance

  socket.on('feed', async msg => {

    const data = await ProblemModel.find({ ProblemCode: parseInt(sanitize(socket.data.prob_id)) })
    const { TimeLimit, SupportedLang, Mem, ProblemCode, isSpecialJudge, TestProgress } = JSON.parse(JSON.stringify(data[0]))

    if (SupportedLang.indexOf(msg.lang) == -1) {
      await client.del(socket.data.uid)
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
        socket.emit("error", "failed creating judge environment")
      }
      await judgeInstance.compileCode()
      socket.emit("compile_end", "")

      const matchedCases = await judgeInstance.testCode(TimeLimit, ProblemCode, (a, b) => socket.emit("judge_progress", [a, b]))
      isCorrect = matchedCases.every(e => e.matched)

      databaseTCdata = matchedCases.map((elem) => {
        return { Mem: elem.memory, Time: elem.exect, State: elem.tle ? "TLE" : elem.matched ? "AC" : "AW" }
      })

      await SubmissionSchema.create({
        User: socket.data.uid,
        Code: sanitize(msg.codeData),
        Status: isCorrect ? 'AC' : 'AW',
        CodeLength: msg.codeData.length,
        TC: databaseTCdata,
        Prob: parseInt(sanitize(socket.data.prob_id)),
        SubCode: socket.data.sub_code,
        Lang: msg.lang
      })
      isSuccess = true

    } catch (e) {

      await SubmissionSchema.create({
        User: socket.data.uid,
        Code: sanitize(msg.codeData),
        Status: e.message == "Compile error" ? "CE" : "ISE",
        CodeLength: msg.codeData.length,
        Prob: parseInt(sanitize(socket.data.prob_id)),
        SubCode: socket.data.sub_code,
        TC: [],
        Lang: msg.lang
      })
      isSuccess = false
    }


    await client.del(socket.data.uid)
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

    const result = await UserModel.bulkWrite(updateOperations);

    if (result.modifiedCount > 0) {
      const updatedProblem = await ProblemModel.findOne({ ProblemCode: ProblemCode }, "-_id submitted solved");
      let calculatedRating = Math.ceil(9 * (1 - (updatedProblem["solved"] / (updatedProblem["submitted"] + 1)) ** 2))
      let rating = updatedProblem["solved"] == 0 ? 10 : calculatedRating < 0 ? 1 : calculatedRating
      await ProblemModel.updateOne({ ProblemCode: ProblemCode }, { $inc: { submitted: 1 }, rating: rating });
      if (isCorrect) {
        await ProblemModel.updateOne({ ProblemCode: ProblemCode }, { $inc: { solved: 1 } });
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