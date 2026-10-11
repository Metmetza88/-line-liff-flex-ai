
import express from 'express'
import { Client, middleware } from '@line/bot-sdk'

const app = express()
const PORT = process.env.PORT || 3000

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
}
const lineClient = new Client(lineConfig)

app.get('/', (req,res)=> res.send('LINE Flex Bot Running'))

app.post('/webhook', middleware(lineConfig), async (req,res)=>{
  try{
    const events = req.body.events
    await Promise.all(events.map(async (event)=>{
      if(event.type === 'message' && event.message.type === 'text'){
        const text = event.message.text
        // Flex สวยๆ ไม่ต้องใช้ AI ก็ได้
        const flex = {
          type: "flex",
          altText: "สวัสดีครับ",
          contents: {
            type: "bubble",
            hero: { type:"image", url:"https://picsum.photos/seed/linebot/600/400", size:"full", aspectRatio:"20:13", aspectMode:"cover" },
            body: { type:"box", layout:"vertical", contents:[
              {type:"text", text:"ยินดีที่ได้รู้จัก!", weight:"bold", size:"xl"},
              {type:"text", text:`คุณพิมพ์ว่า: ${text}`, wrap:true, color:"#666666", margin:"md"},
              {type:"text", text:"บอททำงานแล้ว 100% 🎉", color:"#06C755", weight:"bold", margin:"md"}
            ]},
            footer: { type:"box", layout:"vertical", contents:[
              {type:"button", style:"primary", color:"#06C755", action:{type:"message", label:"ดูเมนู", text:"ดูเมนู"}},
              {type:"button", style:"secondary", margin:"sm", action:{type:"uri", label:"เปิดเว็บ", uri:"https://line.me"}}
            ]}
          }
        }
        return lineClient.replyMessage(event.replyToken, [flex])
      }
    }))
    res.json({ok:true})
  }catch(err){
    console.error(err)
    res.status(500).end()
  }
})

app.listen(PORT, ()=> console.log(`Server running on ${PORT}`))
