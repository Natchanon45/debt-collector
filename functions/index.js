const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const vision = require("@google-cloud/vision");
admin.initializeApp();setGlobalOptions({ region: "asia-southeast1" });const client = new vision.ImageAnnotatorClient();
function setCors(res){res.set("Access-Control-Allow-Origin","*");res.set("Access-Control-Allow-Methods","POST, OPTIONS");res.set("Access-Control-Allow-Headers","Content-Type, Authorization")}
function cleanText(v){return String(v||"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim()}
function normalizeThaiPrefix(name=""){
 return cleanText(name).replace(/น\s*\.\s*ส\s*\.?/g,"นางสาว").replace(/นส\s*\.?/g,"นางสาว").replace(/ด\s*\.\s*ช\s*\.?/g,"เด็กชาย").replace(/ด\s*\.\s*ญ\s*\.?/g,"เด็กหญิง")
}
function stripThaiPrefix(name=""){return normalizeThaiPrefix(name).replace(/^(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง)\s*/,"").trim()}
function cleanThaiLocationField(v=""){
 const parts=cleanText(v).replace(/^(แขวง|ตำบล|ต\.|เขต|อำเภอ|อ\.|จังหวัด|จ\.)\s*/,"").split(" ").filter(Boolean);
 return parts.filter((x,i)=>i===0||x!==parts[i-1]).join(" ");
}
function parseThaiDateToIso(text=""){
 const raw=cleanText(text); if(!raw)return "";
 let m=raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
 if(m){let d=+m[1],mo=+m[2],y=+m[3]; if(y<100)y+=2500; if(y>2400)y-=543; return `${String(y).padStart(4,"0")}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`}
 const months={"ม.ค.":1,"มกราคม":1,"ก.พ.":2,"กุมภาพันธ์":2,"มี.ค.":3,"มีนาคม":3,"เม.ย.":4,"เมษายน":4,"พ.ค.":5,"พฤษภาคม":5,"มิ.ย.":6,"มิถุนายน":6,"ก.ค.":7,"กรกฎาคม":7,"ส.ค.":8,"สิงหาคม":8,"ก.ย.":9,"กันยายน":9,"ต.ค.":10,"ตุลาคม":10,"พ.ย.":11,"พฤศจิกายน":11,"ธ.ค.":12,"ธันวาคม":12};
 const keys=Object.keys(months).join("|").replace(/\./g,"\\."); m=raw.match(new RegExp(`(\\d{1,2})\\s*(${keys})\\s*(\\d{2,4})`));
 if(m){let d=+m[1],mo=months[m[2]],y=+m[3]; if(y<100)y+=2500; if(y>2400)y-=543; return `${String(y).padStart(4,"0")}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`}
 return "";
}
function parseThaiAddressParts(text=""){
 const raw=cleanText(text);
 const provinces=["กรุงเทพมหานคร","กระบี่","กาญจนบุรี","กาฬสินธุ์","กำแพงเพชร","ขอนแก่น","จันทบุรี","ฉะเชิงเทรา","ชลบุรี","ชัยนาท","ชัยภูมิ","ชุมพร","เชียงราย","เชียงใหม่","ตรัง","ตราด","ตาก","นครนายก","นครปฐม","นครพนม","นครราชสีมา","นครศรีธรรมราช","นครสวรรค์","นนทบุรี","นราธิวาส","น่าน","บึงกาฬ","บุรีรัมย์","ปทุมธานี","ประจวบคีรีขันธ์","ปราจีนบุรี","ปัตตานี","พระนครศรีอยุธยา","พะเยา","พังงา","พัทลุง","พิจิตร","พิษณุโลก","เพชรบุรี","เพชรบูรณ์","แพร่","ภูเก็ต","มหาสารคาม","มุกดาหาร","แม่ฮ่องสอน","ยโสธร","ยะลา","ร้อยเอ็ด","ระนอง","ระยอง","ราชบุรี","ลพบุรี","ลำปาง","ลำพูน","เลย","ศรีสะเกษ","สกลนคร","สงขลา","สตูล","สมุทรปราการ","สมุทรสงคราม","สมุทรสาคร","สระแก้ว","สระบุรี","สิงห์บุรี","สุโขทัย","สุพรรณบุรี","สุราษฎร์ธานี","สุรินทร์","หนองคาย","หนองบัวลำภู","อ่างทอง","อำนาจเจริญ","อุดรธานี","อุตรดิตถ์","อุทัยธานี","อุบลราชธานี"];
 let province=/กรุงเทพ|กทม/.test(raw)?"กรุงเทพมหานคร":(provinces.find(p=>raw.includes(p))||"");
 const subMatch=raw.match(/(?:แขวง|ตำบล|ต\.)\s*([^\s,]+(?:\s+[^\s,]+)?)/);
 const distMatch=raw.match(/(?:เขต|อำเภอ|อ\.)\s*([^\s,]+(?:\s+[^\s,]+)?)/);
 let subDistrict=cleanThaiLocationField(subMatch?.[1]||"");
 let district=cleanThaiLocationField(distMatch?.[1]||"");
 let shortAddress=raw.replace(/^ที่อยู่\s*/,"")
  .replace(/\s*(?:แขวง|ตำบล|ต\.)\s*[^\s,]+(?:\s+[^\s,]+)?(?=\s*(?:เขต|อำเภอ|อ\.|จังหวัด|จ\.|กรุงเทพ|กทม|$))/g,"")
  .replace(/\s*(?:เขต|อำเภอ|อ\.)\s*[^\s,]+(?:\s+[^\s,]+)?(?=\s*(?:จังหวัด|จ\.|กรุงเทพ|กทม|$))/g,"")
  .replace(/\s*(?:จังหวัด|จ\.)\s*[^\s,]+/g,"")
  .replace(/\s*(?:กรุงเทพมหานคร|กรุงเทพฯ|กทม\.?)\s*$/g,"").replace(/\s+/g," ").trim();
 const houseNo=(shortAddress.match(/(?:บ้านเลขที่\s*)?([0-9]+(?:\/[0-9]+)?)/i)||raw.match(/(?:บ้านเลขที่\s*)?([0-9]+(?:\/[0-9]+)?)/i)||[])[1]||"";
 return{district,province,subDistrict,houseNo,shortAddress};
}
function normalizeThaiLocation(text){return parseThaiAddressParts(text)}
function parseThaiNameParts(fullName=""){
 let full=normalizeThaiPrefix(fullName); let prefix="",firstName="",lastName="";
 const nm=full.match(/^(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง)\s*(.+)$/);
 if(nm){prefix=nm[1];full=nm[2].trim()}
 const parts=full.split(/\s+/).filter(Boolean); firstName=parts[0]||""; lastName=parts.slice(1).join(" ");
 return{prefix,firstName,lastName};
}
function parseThaiIdCard(text){
 const rawText=String(text||"");
 const idMatch=rawText.match(/\b\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d\b/);
 const idCard=idMatch?idMatch[0].replace(/\D/g,""):"";
 const lines=rawText.split(/\n+/).map(s=>s.trim()).filter(Boolean);
 const fullName=lines.find(l=>/(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)/.test(l)&&/[ก-๙]/.test(l))||"";
 const name=parseThaiNameParts(fullName);
 const address=lines.find(l=>/(ที่อยู่|บ้านเลขที่|หมู่|ถนน|ซ\.|ซอย|ตำบล|แขวง|อำเภอ|เขต|จังหวัด|กรุงเทพ)/.test(l))||"";
 const loc=parseThaiAddressParts(rawText);
 const addrParts=parseThaiAddressParts(address);
 const birthDate=parseThaiDateToIso((rawText.match(/(?:เกิด|วันเกิด|Date of Birth|Birth Date)\s*[:：]?\s*([^\n]+)/i)||[])[1]||"");
 return{idCard,fullName,...name,address:addrParts.shortAddress||address.replace(/^ที่อยู่\s*/,"").trim(),houseNo:addrParts.houseNo||loc.houseNo,subDistrict:loc.subDistrict,district:loc.district,province:loc.province,birthDate,rawText};
}
exports.ocrThaiIdCardV2=onRequest({memory:"512MiB",timeoutSeconds:60,invoker:"public"},async(req,res)=>{setCors(res);if(req.method==="OPTIONS")return res.status(204).send("");try{if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});const authHeader=req.headers.authorization||"";const idToken=authHeader.startsWith("Bearer ")?authHeader.slice(7):"";if(!idToken)return res.status(401).json({error:"Missing Firebase ID token"});await admin.auth().verifyIdToken(idToken);const{imageBase64}=req.body||{};if(!imageBase64)return res.status(400).json({error:"Missing imageBase64"});const[result]=await client.textDetection({image:{content:Buffer.from(imageBase64,"base64")}});return res.json(parseThaiIdCard(result.fullTextAnnotation?.text||""))}catch(err){console.error(err);return res.status(500).json({error:err.message||"OCR failed"})}});
exports.testTelegramReminder=onRequest({invoker:"public"},async(req,res)=>{setCors(res);if(req.method==="OPTIONS")return res.status(204).send("");return res.json({ok:true,message:"Telegram reminder endpoint placeholder"})});
exports.dailyDebtReminder=onSchedule({schedule:"0 8 * * *",timeZone:"Asia/Bangkok"},async()=>{console.log("TODO: query Firestore due debts and send Email/Telegram reminders")});
