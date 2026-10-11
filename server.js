import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { Client, middleware } from '@line/bot-sdk'
import OpenAI from 'openai'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

// LINE Client
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
}
const lineClient = new Client(lineConfig)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

app.use(cors())
app.use(express.static(path.join(__dirname, 'public')))
app.use('/liff', express.static(path.join(__dirname, 'public/liff')))

// --- SYSTEM PROMPT สำหรับให้ AI สร้าง Flex เท่านั้น ---
const FLEX_SYSTEM_PROMPT = `
คุณคือผู้เชี่ยวชาญ LINE Flex Message JSON
หน้าที่: รับข้อความผู้ใช้ แล้วสร้าง Flex Message JSON ที่สวยงาม ทันสมัย

กฎเข้มงวด:
1. ตอบเป็น JSON object เดียวเท่านั้น โครงสร้างต้องเป็น {"type":"flex","altText":"...","contents":{...}}
2. altText ต้องสรุปสั้นๆ ภาษาไทย เช่น "รายการสินค้าแนะนำ"
3. contents ต้องเป็น bubble หรือ carousel เท่านั้น ห้ามเป็นอย่างอื่น
4. ใช้สีโทนทันสมัย #06C755 (LINE green) เป็นหลัก
5. ถ้าผู้ใช้พิมพ์คำว่า "สินค้า", "เมนู", "ดูของ" -> สร้าง carousel 2-3 bubble
6. ถ้าพิมพ์ "จอง", "บิล", "ใบเสร็จ", "สรุป" -> สร้าง bubble แบบ receipt มีปุ่ม
7. ห้ามใส่ markdown, ห้ามใส่ \`\`\`, ห้ามมีข้อความนอก JSON
8. image url ให้ใช้ https://picsum.photos/seed/xxx/600/400 ถ้าไม่มีรูปจริง

ตัวอย่างที่ดี:
{
  "type": "flex",
  "altText": "สินค้าแนะนำสำหรับคุณ",
  "contents": {
    "type": "carousel",
    "contents": [
      {
        "type": "bubble",
        "hero": {"type":"image","url":"https://picsum.photos/seed/a1/600/400","size":"full","aspectRatio":"20:13","aspectMode":"cover"},
        "body": {"type":"box","layout":"vertical","contents":[
          {"type":"text","text":"รองเท้าวิ่ง CloudRun","weight":"bold","size":"md"},
          {"type":"text","text":"เบา นุ่ม เด้ง ซัพพอร์ตดี","size":"sm","color":"#888888","wrap":true},
          {"type":"box","layout":"baseline","margin":"md","contents":[
            {"type":"text","text":"1,990","weight":"bold","size":"xl","color":"#06C755","flex":0},
            {"type":"text","text":"บาท","size":"sm","color":"#888888","margin":"sm"}
          ]}
        ]},
        "footer": {"type":"box","layout":"vertical","contents":[
          {"type":"button","style":"primary","color":"#06C755","action":{"type":"uri","label":"ดูรายละเอียด","uri":"https://line.me"}}
        ]}
      }
    ]
  }
}
`.trim()

async function generateFlexFromAI(userText) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: FLEX_SYSTEM_PROMPT },
        { role: "user", content: userText }
      ]
    })
    const json = JSON.parse(completion.choices[0].message.content)
    // validate
    if (json.type !== 'flex' || !json.contents) throw new Error('Invalid flex')
    if (!json.altText) json.altText = 'ข้อความจาก AI'
    return json
  } catch (e) {
    console.error('AI Error:', e)
    // Fallback Flex
    return {
      type: "flex",
      altText: "ข้อความจากระบบ",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "ขออภัย ระบบขัดข้อง", weight: "bold", color: "#FF3344" },
            { type: "text", text: userText, wrap: true, margin: "md", size: "sm", color: "#666666" },
            { type: "text", text: "ลองพิมพ์ใหม่ได้เลยนะครับ", margin: "lg", size: "sm" }
          ]
        }
      }
    }
  }
}

// Health check
app.get('/', (req,res)=>{
  res.send('LINE LIFF + Flex AI is running. POST /webhook for LINE, POST /api/generate-flex for LIFF')
})

// API สำหรับ LIFF เรียกเพื่อสร้าง Flex
app.use(express.json())
app.post('/api/generate-flex', async (req,res)=>{
  const { query, userId } = req.body
  if(!query) return res.status(400).json({error: 'query required'})
  const flexMessage = await generateFlexFromAI(query)
  // ถ้าต้องการ push ไปเลยทันที
  if(userId){
    try { await lineClient.pushMessage(userId, [flexMessage]) } catch(e){ console.log('push skip', e.message) }
  }
  res.json({ flexMessage })
})

// Webhook LINE - ต้องใช้ middleware ของ LINE เพื่อตรวจ signature
app.post('/webhook', middleware(lineConfig), async (req,res)=>{
  try{
    const events = req.body.events
    await Promise.all(events.map(async (event)=>{
      if(event.type === 'message' && event.message.type === 'text'){
        const flex = await generateFlexFromAI(event.message.text)
        return lineClient.replyMessage(event.replyToken, [flex])
      }
      if(event.type === 'message' && event.message.text === undefined){
        // ถ้าส่งสติ๊กเกอร์ รูปภาพ
        return lineClient.replyMessage(event.replyToken, [{type:'text', text:'พิมพ์ข้อความมาได้เลย เช่น "ดูสินค้าหน่อย" หรือเปิดเมนู LIFF ด้านล่าง'}])
      }
    }))
    res.json({ok:true})
  }catch(err){
    console.error(err)
    res.status(500).end()
  }
})

app.listen(PORT, ()=> console.log(`Server
