import mongoose from "mongoose";

const ProblemSchema = new mongoose.Schema({
    Mem: Number,
    TimeLimit:Number,
    ProblemCode: Number,
    ProblemName: String,
    Script: String,
    SupportedLang: [String],
    TestProgress: {
        Disallow: [String],
        SpecialJudge: {Code:String,Lang:String}
    },
    rating: Number,
    solved: Number,
    submitted: Number,
    tags: [String],
    isSpecialJudge:Boolean
})
const model = mongoose.models.Problems || mongoose.model("Problems", ProblemSchema);
export default model