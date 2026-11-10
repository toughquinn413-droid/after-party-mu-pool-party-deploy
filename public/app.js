async function loadSettings(){
  const s=await fetch("/api/settings").then(r=>r.json());
  document.getElementById("tagline").textContent=s.tagline;
  document.getElementById("price").textContent=s.ticket_price;
  document.getElementById("paymentNumber").textContent=s.payment_number;
  document.getElementById("eventDate").textContent=s.event_date;
  document.getElementById("venue").textContent=s.venue;
  document.getElementById("footerContact").textContent=s.payment_number;
}
function countdown(){
  const el=document.getElementById("countdown");
  const target=new Date("2026-11-15T18:00:00+03:00").getTime();
  const t=Math.max(0,target-Date.now());
  const d=Math.floor(t/86400000),h=Math.floor(t%86400000/3600000),m=Math.floor(t%3600000/60000),s=Math.floor(t%60000/1000);
  el.innerHTML=`<div><b>${d}</b><span>Days</span></div><div><b>${h}</b><span>Hours</span></div><div><b>${m}</b><span>Minutes</span></div><div><b>${s}</b><span>Seconds</span></div>`;
}
const userToken=localStorage.getItem("apm_user_token"); if(userToken){document.getElementById("loginNotice").classList.add("hidden");document.getElementById("ticketForm").classList.remove("hidden");}
document.getElementById("ticketForm").addEventListener("submit",async e=>{
  e.preventDefault(); const fd=new FormData(e.target); const r=await fetch("/api/tickets",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+userToken},body:JSON.stringify(Object.fromEntries(fd))}); const j=await r.json();
  document.getElementById("ticketResult").innerHTML=r.ok?`<div class="success">Ticket request submitted. Your ticket number is <b>${j.ticketNo}</b>. Keep it safe.</div>`:`<div class="error">${j.error||"Could not submit"}</div>`;
});
async function loadMessages(){const m=await fetch("/api/messages").then(r=>r.json());document.getElementById("messages").innerHTML=m.map(x=>`<div class="msg"><b>${x.name}</b><span>${x.message}</span></div>`).join("");}
document.getElementById("chatForm").addEventListener("submit",async e=>{e.preventDefault();const fd=new FormData(e.target);await fetch("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(fd))});e.target.reset();loadMessages();});
loadSettings();loadMessages();countdown();setInterval(countdown,1000);setInterval(loadMessages,5000);