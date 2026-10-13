export default{async fetch(req){
  const H={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if(req.method==='OPTIONS')return new Response(null,{headers:H,status:204});
  const j=await req.json().catch(()=>({}));const url=new URL(req.url);const R=env.rooms;
  const sec=()=>crypto.randomUUID().replace(/-/g,'').slice(0,32);
  const id=()=>{const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<8;i++)s+=c[Math.floor(Math.random()*c.length)];return s.slice(0,4)+'-'+s.slice(4)};
  const send=(o,st=200)=>Response.json(o,{status:st,headers:H});
  const get=async k=>JSON.parse(await R.get(k)||'null');const put=async(k,v)=>R.put(k,JSON.stringify(v));
  if(url.pathname==='/api/create'){const i=id();await put(i,{host:{secret:sec(),team:j.team||null,name:j.name||'Anfitrión'},guest:null});return send({id:i,secret:(await get(i)).host.secret})}
  if(url.pathname==='/api/join'){const r=await get(j.id);if(!r)return send({error:'Sala no encontrada'},404);if(r.guest)return send({error:'Sala llena'},409);r.guest={secret:sec(),team:null,name:j.name||'Rival'};await put(j.id,r);return send({secret:r.guest.secret})}
  if(url.pathname==='/api/submit'){const r=await get(j.id);if(!r)return send({error:'Sala no encontrada'},404);const slot=r.host.secret===j.secret?'host':(r.guest&&r.guest.secret===j.secret?'guest':null);if(!slot)return send({error:'Credencial inválida'},403);r[slot].team=j.team;r[slot].name=j.name||r[slot].name;await put(j.id,r);return send({ok:true})}
  if(url.pathname==='/api/peek'){const r=await get(j.id);if(!r)return send({error:'Sala no encontrada'},404);const me=r.host.secret===j.secret?'host':(r.guest&&r.guest.secret===j.secret?'guest':null);if(!me)return send({error:'Credencial inválida'},403);const other=me==='host'?'guest':'host';const mine=r[me].team;const both=mine&&r[other]&&r[other].team;return send({status:!r[other]?'waiting':(both?'revealed':'pending'),you:mine,youName:r[me].name,them:both?r[other].team:null,themName:r[other]?r[other].name:null,role:me})}
  return send({error:'ruta desconocida'},404);
}}