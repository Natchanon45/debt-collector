const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const vision = require("@google-cloud/vision");
admin.initializeApp(); setGlobalOptions({ region: "asia-southeast1" }); const client = new vision.ImageAnnotatorClient();
function setCors(res) { res.set("Access-Control-Allow-Origin", "*"); res.set("Access-Control-Allow-Methods", "POST, OPTIONS"); res.set("Access-Control-Allow-Headers", "Content-Type, Authorization") }
function normalizeThaiLocation(text) {
    const raw = String(text || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    const provinces = ["กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก", "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน", "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา", "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ", "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี"];
    let province = "";
    if (/กรุงเทพ|กทม/.test(raw)) province = "กรุงเทพมหานคร";
    if (!province) province = provinces.find(p => raw.includes(p)) || "";
    let district = "";
    const patterns = [/(?:เขต|อำเภอ|อ\.)\s*([ก-๙A-Za-z]+(?:\s+[ก-๙A-Za-z]+)?)/, /(?:แขวง|ตำบล|ต\.)\s*[ก-๙A-Za-z]+\s+(?:เขต|อำเภอ|อ\.)\s*([ก-๙A-Za-z]+(?:\s+[ก-๙A-Za-z]+)?)/, /(?:เขต|อำเภอ|อ\.)\s*([ก-๙A-Za-z]+)(?=\s*(?:จังหวัด|จ\.|กรุงเทพ|$))/];
    for (const p of patterns) { const mm = raw.match(p); if (mm && mm[1]) { district = mm[1].trim(); break } }
    district = district.replace(/จังหวัด.*$/, "").replace(/กรุงเทพมหานคร.*$/, "").replace(/กทม.*$/, "").trim();
    return { district, province };
}
function parseThaiIdCard(text) {
    const rawText = String(text || "");
    const idMatch = rawText.match(/\b\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d\b/);
    const idCard = idMatch ? idMatch[0].replace(/\D/g, "") : "";
    const lines = rawText.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const fullName = lines.find(l => /(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)/.test(l) && /[ก-๙]/.test(l)) || "";
    let prefix = "", firstName = "", lastName = "";
    const nm = fullName.match(/(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*([^\s]+)\s*(.*)/);
    if (nm) { prefix = nm[1] || ""; firstName = nm[2] || ""; lastName = (nm[3] || "").trim() }
    const address = lines.find(l => /(ที่อยู่|บ้านเลขที่|หมู่|ถนน|ตำบล|แขวง|อำเภอ|เขต|จังหวัด|กรุงเทพ)/.test(l)) || "";
    const loc = normalizeThaiLocation(rawText);
    return { idCard, fullName, prefix, firstName, lastName, address: address.replace(/^ที่อยู่\s*/, "").trim(), district: loc.district, province: loc.province, rawText };
}
exports.ocrThaiIdCardV2 = onRequest({ memory: "512MiB", timeoutSeconds: 60, invoker: "public" }, async (req, res) => { setCors(res); if (req.method === "OPTIONS") return res.status(204).send(""); try { if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" }); const authHeader = req.headers.authorization || ""; const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""; if (!idToken) return res.status(401).json({ error: "Missing Firebase ID token" }); await admin.auth().verifyIdToken(idToken); const { imageBase64 } = req.body || {}; if (!imageBase64) return res.status(400).json({ error: "Missing imageBase64" }); const [result] = await client.textDetection({ image: { content: Buffer.from(imageBase64, "base64") } }); return res.json(parseThaiIdCard(result.fullTextAnnotation?.text || "")) } catch (err) { console.error(err); return res.status(500).json({ error: err.message || "OCR failed" }) } });
exports.testTelegramReminder = onRequest({ invoker: "public" }, async (req, res) => { setCors(res); if (req.method === "OPTIONS") return res.status(204).send(""); return res.json({ ok: true, message: "Telegram reminder endpoint placeholder" }) });
exports.dailyDebtReminder = onSchedule({ schedule: "0 8 * * *", timeZone: "Asia/Bangkok" }, async () => { console.log("TODO: query Firestore due debts and send Email/Telegram reminders") });
