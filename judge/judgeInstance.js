import { Docker } from "node-docker-api";
import { spawn, exec } from "child_process";
import fs from 'fs'
import crypto from "crypto";
import { LanguageHandler } from "./languageLib.js";
import SpecialJudgeInstance from "./specialJudge.js";

const docker = new Docker({ socketPath: '/var/run/docker.sock' });


const execAsync = (command) => {
    return new Promise((resolve, reject) => {
        exec(command, (err, stdout) => {
            if (err) {
                reject(err)
            } else {
                resolve(stdout.trim())
            }
        })
    })
}

const createFileHash_Fast = (dir) => {

    return new Promise((resolve, reject) => {
        try {
            var fd = fs.createReadStream(dir);
            var hash = crypto.createHash('md5');
            hash.setEncoding('hex');

            fd.on('end', function () {
                hash.end();
                resolve(hash.read());
            });
            fd.pipe(hash);
        } catch (e) {
            reject(e)
        }
    })

}

export class Judge {
    constructor(lang, memory, containerPresistTime, isSpecialJudge) {
        this.containerPresistTime = containerPresistTime
        this.lang = lang
        this.memory = memory
        this.contName = crypto.randomBytes(10).toString('hex')
        this.languageHandlerInstance = new LanguageHandler(lang, this.contName)
        this.filePrefix = this.languageHandlerInstance.getPrefix()
        this.container
        //setting

        this.chunkSize = 3
        this.testCaseLocation = "/workspaces/socket_server/test_cases"
        this.temporaryJudgeLocation = "/workspaces/socket_server"
        if (isSpecialJudge) {
            this.specialJudge = new SpecialJudgeInstance()
        }
    }

    Terminate = async () => {
        try {
            if (this.specialJudge) {
                await this.specialJudge.terminate()
            }
            var st = await this.container.status()
            if (["running", "stopped", "exited"].indexOf(st["data"]["State"]["Status"]) !== -1) {
                await this.container.kill()
                await this.container.delete({ force: true });
            }
        } catch (e) { }
    }

    CreateRunEnv = async (codeData, specialJudge) => {
        try {
            let compiler = this.languageHandlerInstance.getImage()
            this.container = await docker.container.create({
                Image: compiler,
                name: this.contName,
                UsernsMode: 'host',
                NetworkDisabled: true,
                Cmd: [`sleep ${this.containerPresistTime + 200}&&shutdown -h `],
                WorkingDir: `/var/execDir`,
                HostConfig: {
                    Memory: this.memory,
                    MemorySwap: 0,
                    MemoryReservation: 0,
                    Privileged: false,
                    NanoCpus: 1e9,
                    CapDrop: [
                        'MKNOD',
                        'SYS_ADMIN',
                        'SYS_CHROOT',
                        'SYS_BOOT',
                        'SYS_MODULE',
                        'SYS_PTRACE',
                        'SYSLOG'
                    ],
                    Ulimits: [
                        {
                            Name: 'nofile',
                            Soft: 4096,
                            Hard: 8192
                        },
                        {
                            Name: 'nproc',
                            Soft: 30,
                            Hard: 31
                        }
                    ]
                },
                Entrypoint: [
                    "/bin/sh",
                    "-c",
                ],
            })
            await this.container.start()

            const tempFileName = `${this.temporaryJudgeLocation}/${this.contName}.${this.filePrefix}`
            await fs.promises.writeFile(tempFileName, codeData)
            await execAsync(`docker cp ${tempFileName} ${this.contName}:/var/execDir`)
            await fs.promises.unlink(tempFileName)
            if (this.specialJudge) {
                await this.specialJudge.init(specialJudge)
            }
            return true

        } catch (e) {
            console.log(e)
            return false
        }
    }
    compileCode = async () => {
        let compileCommand
        try {
            compileCommand = this.languageHandlerInstance.getCompileCommand()
            if (compileCommand == "") return true
        } catch (e) {
            await this.Terminate()
            throw new Error(`Unsupported language`);
        }
        const containerExecutor = await this.container.exec.create({
            Cmd: ["/bin/sh", "-c", compileCommand],
            AttachStdout: true,
            AttachStderr: true,
        });
        const stream = await containerExecutor.start({ Detach: false })

        return await new Promise((resolve, reject) => {
            let udata = '';
            stream.on('error', async (data) => {
                await this.Terminate()
                reject({ message: "Compile error", detail: data.toString() })
            })
            stream.on('end', async () => {
                if (udata.length > 0) {
                    await this.Terminate()
                    reject({ message: "Compile error", detail: udata })
                } else {
                    resolve(true)
                }
            })
            stream.on('data', async (data) => {
                udata += data.toString()
            })
        })
    }


    runInput = async () => {
        let runCommand
        try {
            runCommand = this.languageHandlerInstance.getRunCodeCommand()
        } catch (e) {
            await this.Terminate()
            throw new Error(`Unsupported language`);
        }
        return spawn('docker', ['exec', '-i', this.contName, '/bin/sh', '-c', runCommand])
    }

    endInput = async () => {
        await this.Terminate()
    }

    testCode = async (timeLimit, problemId, callBack) => {

        let runCommand
        try {
            runCommand = this.languageHandlerInstance.getRunCodeCommand()
        } catch (e) {
            await this.Terminate()
            throw new Error(`Unsupported language`);

        }
        let caseDirs = (await fs.promises.readdir(`${this.testCaseLocation}/${problemId}`)).filter((fileName) => {
            return /^\d+\.in$/.test(fileName)
        })
        let matchedCases = Array(caseDirs.length)
        let isTLE = []
        const chunkSize = this.chunkSize;

        for (var i = 0; i < Math.ceil(caseDirs.length / chunkSize); i++) {
            var testCase = caseDirs.slice(i * chunkSize, (i + 1) * chunkSize)

            await Promise.all(testCase.map(async (elem, inner_i) => {
                let index = i * chunkSize + inner_i
                const tle = setTimeout(
                    () => {
                        isTLE[index] = true;
                        if (caseDirs.length - 1 <= index) this.Terminate()
                    },
                    timeLimit)

                return new Promise(async (resolve, reject) => {
                    let time, mem
                    let baseCommand = spawn('docker', ['exec', '-i', this.contName, '/usr/bin/time', '-v', ...runCommand.split(" ")])
                    let tc_stat = await fs.promises.stat(`${this.testCaseLocation}/${problemId}/${elem.replace("in", "out")}`)
                    await fs.promises.writeFile(`${this.temporaryJudgeLocation}/${this.contName}_${index}.out`,'')
                    var tcdata = fs.createReadStream(`${this.testCaseLocation}/${problemId}/${elem}`)
                    const stdinWritable = baseCommand.stdin;

                    tcdata.on('data', (chunk) => {
                        try{
                            stdinWritable.cork();
                            stdinWritable.write(chunk.toString());
                            stdinWritable.uncork();
                        }catch(e){ }
                    });

                    stdinWritable.on('error',()=>{
                    })

                    const startTime = Date.now()

                    let wroteBytesSize = 0
                    baseCommand.stdout.on('data', (data) => {
                        try{
                            wroteBytesSize += data.toString().length
                            fs.appendFile(`${this.temporaryJudgeLocation}/${this.contName}_${index}.out`, data.toString(),(err)=>{
                                if(err){
                                    console.log(err)
                                }
                                callBack(index, (wroteBytesSize) / (tc_stat.size))
                            });
                        }catch(e){}
                    })
                    baseCommand.stderr.on('data', async (data) => {
                        const dta = data.toString()
                        if (dta.includes("exited with non-zero status")) {
                            clearTimeout(tle)
                            reject("stdError")
                            try {
                                await fs.promises.unlink(`${this.temporaryJudgeLocation}/${this.contName}_${index}.out`)
                            } catch (e) { }
                            await this.Terminate()
                        } else {
                            try {
                                time = parseFloat(dta.match(/Elapsed \(wall clock\) time \(h:mm:ss or m:ss\): \d+m (\d+\.\d+)s/)[1])
                                mem = parseInt(dta.match(/Maximum resident set size \(kbytes\): (\d+)/)[1])
                            } catch (e) { }
                        }
                    })
                    baseCommand.on('close', async (code) => {
                        const endTime = Date.now()
                        matchedCases[index] = {
                            matched: false,
                            tle: false,
                            lim: timeLimit / 1000,
                            exect: typeof time == "undefined" ? ((endTime - startTime) / 1000).toFixed(2) : time,
                            memory: mem
                        }
                        if (code == 137 && isTLE[index]) {
                            matchedCases[index]["tle"] = true
                            await fs.promises.unlink(`${this.temporaryJudgeLocation}/${this.contName}_${index}.out`)
                        } else {
                            let correct_out = await createFileHash_Fast(`${this.testCaseLocation}/${problemId}/${elem.replace("in", "out")}`)
                            let user_out = await createFileHash_Fast(`${this.temporaryJudgeLocation}/${this.contName}_${index}.out`)
                            console.log(correct_out,user_out)
                            if (correct_out === user_out) {
                                matchedCases[index]["matched"] = true
                            }
                            else if (this.specialJudge) {
                                await this.specialJudge.feed(`${this.temporaryJudgeLocation}/${this.contName}_${index}.out`, `${this.testCaseLocation}/${problemId}/${elem}`)

                                if (await this.specialJudge.judge()) {
                                    matchedCases[index]["matched"] = true
                                }
                            }
                            await fs.promises.unlink(`${this.temporaryJudgeLocation}/${this.contName}_${index}.out`)
                        }
                        clearTimeout(tle)
                        resolve(true)
                    });
                })
            }))

        }

        await this.Terminate()
        return matchedCases
    }
}