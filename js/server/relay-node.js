/* Node puro, sin dependencias.  node relay-node.js  →  http://localhost:8787 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
const PORT = process.env.PORT || 8787;
const rooms = new Map(); // id -> {host:{secret,team,name}, guest:{secret,team,name}}
const sec = () => randomBytes(16).toString('hex');
const genId = () => {const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<8;i++)s+=c[Math.floor(Math.random()*c.length)];return s.slice(0,4)+'-'+s.slice(4)};

const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
http.createServer((req,res)=>{
  for(const[k,v]of Object.entries(CORS))res.setHeader(k,v);
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  let b='';req.on('data',d=>b+=d);req.on('end',async()=>{
    const j=JSON.parse(b||'{}');const send=(o,code=200)=>{res.writeHead(code,{'content-type':'application/json',...CORS});res.end(JSON.stringify(o))};
    try{
      if(req.url==='/api/create'){const id=genId(),secret=sec();rooms.set(id,{host:{secret,team:j.team||null,name:j.name||'Anfitrión'},guest:null});send({id,secret,role:'host'})}
      else if(req.url==='/api/join'){const r=rooms.get(j.id);if(!r)return send({error:'Sala no encontrada'},404);if(r.guest)return send({error:'Sala llena'},409);const g={secret:sec(),team:null,name:j.name||'Rival'};r.guest=g;send({secret:g.secret})}
      else if(req.url==='/api/submit'){const r=rooms.get(j.id);if(!r)return send({error:'Sala no encontrada'},404);const slot=r.host.secret===j.secret?'host':(r.guest&&r.guest.secret===j.secret?'guest':null);if(!slot)return send({error:'Credencial inválida'},403);r[slot].team=j.team;r[slot].name=j.name||r[slot].name;send({ok:true})}
      else if(req.url==='/api/peek'){const r=rooms.get(j.id);if(!r)return send({error:'Sala no encontrada'},404);const me=r.host.secret===j.secret?'host':(r.guest&&r.guest.secret===j.secret?'guest':null);if(!me)return send({error:'Credencial inválida'},403);const other=me==='host'?'guest':'host';const mine=r[me].team;const hasBoth=mine&&r[other]&&r[other].team;
        send({status:!r[other]?'waiting':(hasBoth?'revealed':'pending'),you:mine,youName:r[me].name,them:hasBoth?r[other].team:null,themName:r[other]?r[other].name:null,role:me});}
      else send({error:'ruta desconocida'},404);
    }catch(e){send({error:String(e.message||e)},500)}
  });
}).listen(PORT,()=>console.log('PokeForge relay → http://localhost:'+PORT));