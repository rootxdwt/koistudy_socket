import { Docker } from "node-docker-api";
import { spawn, exec } from "child_process";
import fs from 'fs'
import crypto from "crypto";
import { LanguageHandler } from "./languageLib.js";

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


export default class SpecialJudgeInstance {
    constructor() {
        this.container
        this.temporaryJudgeLocation = "/workspaces/socket_server" //no trailing slash(/) allowed
        this.contName = crypto.randomBytes(10).toString('hex')
        this.languageHandlerInstance
        this.userOutputPath
        this.TestCaseInputPath
    }

    terminate = async () => {
        try {
            var st = await this.container.status()
            if (["running", "stopped", "exited"].indexOf(st["data"]["State"]["Status"]) !== -1) {
                await this.container.kill()
                await this.container.delete({ force: true });
            }
        } catch (e) { }
    }

    init = async (SpecialJudge) => {

        const { Lang, Code } = SpecialJudge

        this.languageHandlerInstance = new LanguageHandler(Lang, this.contName)

        this.container = await docker.container.create({
            Image: this.languageHandlerInstance.getImage(),
            name: this.contName,
            UsernsMode: 'host',
            NetworkDisabled: true,
            Cmd: [`sleep 200`],
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

        const tempFileName = `${this.temporaryJudgeLocation}/${this.contName}.${this.languageHandlerInstance.getPrefix()}`
        await fs.promises.writeFile(tempFileName, Code)
        await execAsync(`docker cp ${tempFileName} ${this.contName}:/var/execDir`)
        await fs.promises.unlink(tempFileName)

        let compileCommand = this.languageHandlerInstance.getCompileCommand()

        if (compileCommand == "") {
            return true
        }

        try {
            await execAsync(`docker exec -i ${this.contName} /bin/sh -c ${compileCommand}`)
        } catch (e) {
            return false
        }
    }

    feed = async (userOutputPath, TestCaseInputPath) => {

        await execAsync(`docker cp ${userOutputPath} ${this.contName}:/var/execDir`)
        await execAsync(`docker cp ${TestCaseInputPath} ${this.contName}:/var/execDir`)

        this.userOutputPath = userOutputPath
        this.TestCaseInputPath = TestCaseInputPath
    }

    judge = async () => {
        try {
            await this.container.start()
            let result = await (new Promise((resolve, reject) => {
                let runCommand = this.languageHandlerInstance.getRunCodeCommand()
                let TestCaseInputPath = "./" + this.TestCaseInputPath.split("/").slice(-1)
                let userOutputPath = "./" + this.userOutputPath.split("/").slice(-1)
                let base = spawn('docker', ['exec', '-i', this.contName, '/usr/bin/time', '-v', ...runCommand.split(" "), TestCaseInputPath, userOutputPath])

                let fullData = ""
                base.stdin.write("\n")
                base.stdin.end();

                base.stdout.on('data', (data) => {
                    fullData += data.toString()
                })

                base.stderr.on('data', (data) => {
                    if (!(data.toString().includes("Command being timed")) || !(data.toString().includes("Exit status: 0"))) {
                        console.log(data.toString())
                        reject(`stderr`)
                    }
                })

                base.on('close', (code) => {
                    if (code == 0) {
                        resolve(fullData.trim() == "success")
                    } else {
                        reject(`exited with code ${code}`)
                    }
                })
            }))
            return result

        } catch (e) {
            throw new Error(e)
        }
    }
}