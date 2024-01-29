import { Server } from "socket.io";
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import RunJudgePage from "./namespaces/runjudge.js"
import RunCodePage from "./namespaces/runcode.js"
import {createClient} from 'redis'
const io = new Server(3010,{
    path: "/sockets/",
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
      allowedHeaders: [],
      credentials: true
    }
  });

io.of("/runjudge").on("connection", RunJudgePage).use(async (socket, next) => {
    const client = createClient();
    await client.connect();
    try {
        const SubmissionCode = crypto.randomBytes(5).toString('hex')
        const verifyData = jwt.verify(socket.handshake.auth.Authorization, process.env.JWTKEY)
        if (verifyData) {
            let uid=verifyData["uid"]
            socket.data = {uid:uid, prob_id: socket.handshake.query.prob_id, sub_code:SubmissionCode}
            if (await client.get(uid) === "true") {
                next(new Error("ratelimited"));
            }else {
                await client.set(uid, 'true', { EX: 60 });
            }
            next()
        } else {
            next(new Error("unauthorized"));
        }
    } catch (e) {
        console.log(e)
        next(new Error("unauthorized"));
    }
});
  
  io.of("/runcode").on("connection", RunCodePage ).use(async (socket, next) => {
    try {
        const verifyData = jwt.verify(socket.handshake.auth.Authorization, process.env.JWTKEY)
        if (verifyData) {
            next()
        } else {
            next(new Error("unauthorized"));
        }
    } catch (e) {
        next(new Error("unauthorized"));
    }
});