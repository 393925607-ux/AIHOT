import { XMLParser } from "fast-xml-parser";
import { mkdirSync, writeFileSync } from "node:fs";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
const feeds = [["OpenAI","https://openai.com/news/rss.xml"],["DeepMind","https://deepmind.google/blog/rss.xml"],["NVIDIA","https://blogs.nvidia.com/feed/"],["Microsoft Research","https://www.microsoft.com/en-us/research/feed/"],["Mistral","https://mistral.ai/rss.xml"]];
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@", textNodeName:"#text", trimValues:true });
const text=(v:any):string=>typeof v==="string"||typeof v==="number"?String(v):Array.isArray(v)?text(v[0]):v&&typeof v==="object"&&"#text"in v?text(v["#text"]):"";
const link=(v:any):string=>typeof v==="string"?v:Array.isArray(v)?link(v.find(x=>x?.["@rel"]==="alternate")??v[0]):v&&typeof v==="object"&&"@href"in v?String(v["@href"]):"";
const clean=(s:string)=>s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
const rows=[];
for (const [source,feed] of feeds) {
  const res=await guardedFetch(feed,{timeoutMs:15000,maxBytes:1500000});
  const doc=parser.parse(res.text());
  const raw=doc.rss?.channel?.item??doc.feed?.entry??[];
  for (const item of (Array.isArray(raw)?raw:[raw]).slice(0,2)) {
    const url=link(item.link), title=text(item.title);
    if (!/^https?:/.test(url)) continue;
    let status="fetch_failed", excerpt="";
    try { const page=await guardedFetch(url,{timeoutMs:15000,maxBytes:1200000}); if (page.status===200) { excerpt=clean(page.text()).slice(0,700); status=excerpt.length>=300?"readable":"short"; } else status=`http_${page.status}`; } catch (e) { status=e instanceof Error?e.name:"fetch_failed"; }
    rows.push({source,title,url,status,excerpt});
  }
}
mkdirSync(".data/claims-recovery",{recursive:true});
writeFileSync(".data/claims-recovery/page-audit-input.json", JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows.map(r=>({source:r.source,status:r.status,title:r.title,url:r.url,chars:r.excerpt.length})),null,2));
