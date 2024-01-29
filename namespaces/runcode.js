import { Judge } from "../judge/judgeInstance.js";

export const config = {
    api: {
        bodyParser: false,
    },
};

const RunCodePage = async (socket) => {
    let baseCommand
    let judge, container
    socket.on('input', async msg => {
        try {
            baseCommand.stdin.write(msg)
        } catch (msg) {
            socket.emit('error', msg.detail)
        }
    })
    socket.on('disconnect', async () => {
        if (container) {
            await judge.Terminate()
        }
    })
    socket.on('codeData', async msg => {
        judge = new Judge(msg.typ, 6291456, 20)
        setTimeout(() => { socket.emit("end", `최대 실행 시간이 초과되었습니다(127)`); judge.Terminate(container); socket.disconnect() }, 20000)
        await judge.CreateRunEnv(msg.data)
        try {
            await judge.compileCode()
            baseCommand = await judge.runInput()
            let outdata = ""
            baseCommand.stdout.on('data', async (data) => {
                outdata += data.toString()
                socket.emit("data", outdata)
                if (data.length > 1000) {
                    await judge.Terminate()
                    socket.emit("end", `최대 출력 제한이 초과되었습니다`)
                    socket.disconnect()
                }
            })
            baseCommand.stderr.on('data', async (data) => {
                await judge.Terminate()
                socket.emit('error', data.toString())
                socket.disconnect()
            })
            baseCommand.on('close', async (code) => {
                socket.emit("end", `${outdata}\nexited with code ${code}`)
                await judge.Terminate()
                socket.disconnect()
            });
            socket.emit('compileEnd', '')
        } catch (msg) {
            socket.emit('error', msg.detail)
            await judge.Terminate()
        }
    })
    socket.on('error', function (ex) {
        console.log("handled error");
        console.log(ex);
    });
};

export default RunCodePage;