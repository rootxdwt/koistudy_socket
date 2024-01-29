import mongoose from "mongoose";

const BannerSchema = new mongoose.Schema({
    Img:String,
    Title:String,
    Sub:String,
    Link:String,
    Color:[Number]
})
const model = mongoose.models.Banner || mongoose.model("Banner", BannerSchema);

export default model