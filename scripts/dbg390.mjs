import puppeteer from "puppeteer-core";
import { createHmac, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const BASE = "http://localhost:3104";
const env = Object.fromEntries(readFileSync("/app/conversations/6af74bd214941bf8d3f15a90/aomi-app/.env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")]}));
const redis=(...a)=>fetch(env.UPSTASH_REDIS_REST_URL,{method:"POST",headers:{Authorization:`Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`},body:JSON.stringify(a)}).then(r=>r.json());
const ids=(await redis("SMEMBERS","aomi:users")).result||[];
let owner=null;
for(const id of ids){const raw=(await redis("HGETALL",`aomi:user:${id}`)).result||[];const u=Object.fromEntries(Array.from({length:raw.length/2},(_,i)=>[raw[i*2],raw[i*2+1]]));if(u.role==="admin")owner=u;}
const UA="Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const b64=b=>Buffer.from(b).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const ua=b64(createHash("sha256").update(UA).digest()).slice(0,16);const now=Math.floor(Date.now()/1000);
const body=b64(JSON.stringify({sub:owner.username,uid:owner.id,role:"admin",ver:Number(owner.sessionVersion||1),iat:now,exp:now+3600,ua}));
const token=`${body}.${b64(createHmac("sha256",env.AOMI_SESSION_SECRET).update(body).digest())}`;
const browser=await puppeteer.launch({executablePath:"/usr/bin/google-chrome",headless:"new",args:["--no-sandbox"]});
const page=await browser.newPage();await page.setUserAgent(UA);
await browser.setCookie({name:"aomi_session",value:token,domain:"localhost",path:"/",httpOnly:true});
await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await page.goto(`${BASE}/chat`,{waitUntil:"networkidle2"});
await new Promise(r=>setTimeout(r,2500));
console.log(JSON.stringify(await page.evaluate(()=>({
  text: document.body.innerText.slice(0,220).replace(/\n+/g," | "),
  h1: document.querySelector("h1")?.textContent,
  cards: document.querySelectorAll("button.aomi-card").length,
  stored: localStorage.getItem("aomi:project"),
  placeholder: document.querySelector("#aomi-composer")?.placeholder,
})),null,1));
await page.screenshot({path:"/tmp/dbg390.png"});
await browser.close();
