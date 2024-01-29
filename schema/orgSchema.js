import mongoose from "mongoose";

const OrgSchema = new mongoose.Schema({
    Admin: [{ userId: String }],
    Name: String,
    OrgCode: String,
    RegCodes: [{ classlabel: String, class: String, data: String }],
})
const model = mongoose.models.Org || mongoose.model("Org", OrgSchema);

export default model