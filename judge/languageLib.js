

export class LanguageHandler {
    name
    fileName
    constructor(name, fileName) {
        this.name = name
        this.fileName = fileName
    }
    getLangFullName = () => {
        switch (this.name) {
            case "python":
                return "Python3"
            case "go":
                return "Go"
            case "javascript":
                return "JavaScript"
            case "cpp":
                return "C++"
            case "php":
                return "PHP"
            case "rust":
                return "Rust"
            case "r":
                return "R"
        }
    }
    getPrefix = () => {
        switch (this.name) {
            case "python":
                return "py"
            case "go":
                return "go"
            case "javascript":
                return "js"
            case "cpp":
                return "cpp"
            case "php":
                return "php"
            case "rust":
                return "rs"
            case "r":
                return "R"
        }
    }
    getImage = () => {
        switch (this.name) {
            case "python":
                return "dockerfiles-py-koi"
            case "go":
                return "dockerfiles-golang-koi"
            case "javascript":
                return "dockerfiles-node-koi"
            case "cpp":
                return "dockerfiles-gcc-koi"
            case "php":
                return "dockerfiles-php-koi"
            case "rust":
                return "dockerfiles-rust-koi"
            case "r":
                return "dockerfiles-r-koi"
        }
    }
    getCompileCommand = () => {
        const fileName = this.fileName
        switch (this.name) {
            case "cpp":
                return `g++ -o ${fileName} ${fileName}.cpp`
            case "go":
                return `go build -o ${fileName} ${fileName}.go`
            case "rust":
                return `rustc ${fileName}.rs -o ${fileName}`
            case "php":
            case "python":
            case "r":
            case "javascript":
                return ""
            default:
                throw new Error(`Unsupported language`);
        }
    }
    getRunCodeCommand = () => {
        const fileName = this.fileName
        switch (this.name) {
            case "cpp":
            case "go":
            case "rust":
                return `./${fileName}`
            case "python":
                return `python3 -u ${fileName}.py` //disable block buffering(-u)
            case "javascript":
                return `node ${fileName}.js`
            case "php":
                return `php ${fileName}.php`
            case "r":
                return `Rscript ${fileName}.R`
            default:
                throw new Error(`Unsupported language`);
        }
    }
}