import mongoose from "mongoose";

const SubmissionSchema = new mongoose.Schema({
    User: String,
    Code: String,
    Status: String,
    Time: { type: Date, default: Date.now },
    CodeLength: Number,
    TC: [{ Mem: Number, Time: Number, State: String }],
    Prob: Number,
    SubCode: String,
    Lang: { type: String }
})
const model = mongoose.models.Submission || mongoose.model("Submission", SubmissionSchema);

export default model