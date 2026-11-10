const express=require('express');
const path=require('path'),fs=require('fs');
const bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),QRCode=require('qrcode');
require('dotenv').config();

const app=express(),PORT=process.env.PORT||3000;
const USE_PG=!!process.env.DATABASE_URL;
let db,pgPool;

function sqlPg(sql){let i=0;return sql.replace(/\?/g,()=>`$${++i}`)}
async function dbAll(sql,params=[]){if(USE_PG){const r=await pgPool.query(sqlPg(sql),params);return r.rows;}return db.prepare(sql).all(...params)}
async function dbGet(sql,params=[]){if(USE_PG){const r=await pgPool.query(sqlPg(sql),params);return r.rows[0];}return db.prepare(sql).get(...params)}
async function dbRun(sql,params=[]){if(USE_PG){return pgPool.query(sqlPg(sql),params);}return db.prepare(sql).run(...params)}

async function initDb(){
 if(USE_PG){
  const {Pool}=require('pg'); pgPool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await pgPool.query(`CREATE TABLE IF NOT EXISTS admins(id SERIAL PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL);CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());CREATE TABLE IF NOT EXISTS tickets(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,name TEXT NOT NULL,phone TEXT NOT NULL,payment_ref TEXT NOT NULL,ticket_no TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'Pending',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());CREATE TABLE IF NOT EXISTS messages(id SERIAL PRIMARY KEY,name TEXT NOT NULL,message TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,event_name TEXT NOT NULL,event_date TEXT NOT NULL,venue TEXT NOT NULL,ticket_price TEXT NOT NULL,payment_number TEXT NOT NULL,tagline TEXT NOT NULL);`);
 } else {
  const Database=require('better-sqlite3'); const DATA=path.join(__dirname,'data');fs.mkdirSync(DATA,{recursive:true});db=new Database(path.join(DATA,'party.db'));db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL);CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,name TEXT NOT NULL,phone TEXT NOT NULL,payment_ref TEXT NOT NULL,ticket_no TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'Pending',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,event_name TEXT NOT NULL,event_date TEXT NOT NULL,venue TEXT NOT NULL,ticket_price TEXT NOT NULL,payment_number TEXT NOT NULL,tagline TEXT NOT NULL);`);
  try{db.exec('ALTER TABLE tickets ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL')}catch(e){}
 }
 if(!(await dbGet('SELECT id FROM admins LIMIT 1'))){const u=process.env.ADMIN_USERNAME||'admin',p=process.env.ADMIN_PASSWORD||'ChangeMe123!';await dbRun('INSERT INTO admins(username,password_hash) VALUES(?,?)',[u,bcrypt.hashSync(p,12)]);}
 if(!(await dbGet('SELECT id FROM settings WHERE id=1'))){await dbRun('INSERT INTO settings(id,event_name,event_date,venue,ticket_price,payment_number,tagline) VALUES(1,?,?,?,?,?,?)',["After Party Mu Pool Party","15 November 2026","Buloba Grounds","UGX 20,000","+256 795 318 747","Relax • Swim • Have Fun"]);}
}

app.use(express.json({limit:'2mb'}));app.use(express.static(path.join(__dirname,'public')));
const secret=()=>process.env.JWT_SECRET||'dev-secret-change-me';
function getToken(req){return (req.headers.authorization||'').replace('Bearer ','')}
function authAdmin(req,res,next){try{req.admin=jwt.verify(getToken(req),secret());next()}catch(e){res.status(401).json({error:'Unauthorized'});}}
function authUser(req,res,next){try{req.user=jwt.verify(getToken(req),secret());next()}catch(e){res.status(401).json({error:'Please login first'});}}

app.get('/api/settings',async(req,res)=>res.json(await dbGet('SELECT event_name,event_date,venue,ticket_price,payment_number,tagline FROM settings WHERE id=1')));
app.post('/api/register',async(req,res)=>{try{const {name,email,phone,password}=req.body;if(!name||!email||!phone||!password||password.length<6)return res.status(400).json({error:'Name, email, phone and a password of at least 6 characters are required'});if(await dbGet('SELECT id FROM users WHERE email=?',[email.toLowerCase()]))return res.status(409).json({error:'An account with that email already exists'});const hash=bcrypt.hashSync(password,12);if(USE_PG){const r=await pgPool.query('INSERT INTO users(name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id',[name,email.toLowerCase(),phone,hash]);return res.status(201).json({token:jwt.sign({id:r.rows[0].id,email:email.toLowerCase(),role:'user'},secret(),{expiresIn:'30d'})});}const r=await dbRun('INSERT INTO users(name,email,phone,password_hash) VALUES(?,?,?,?)',[name,email.toLowerCase(),phone,hash]);return res.status(201).json({token:jwt.sign({id:r.lastInsertRowid,email:email.toLowerCase(),role:'user'},secret(),{expiresIn:'30d'})});}catch(e){res.status(500).json({error:'Registration failed'});}});
app.post('/api/user/login',async(req,res)=>{const {email,password}=req.body;const u=await dbGet('SELECT * FROM users WHERE email=?',[String(email||'').toLowerCase()]);if(!u||!bcrypt.compareSync(password||'',u.password_hash))return res.status(401).json({error:'Invalid email or password'});res.json({token:jwt.sign({id:u.id,email:u.email,role:'user'},secret(),{expiresIn:'30d'}),user:{id:u.id,name:u.name,email:u.email,phone:u.phone}});});
app.get('/api/me',authUser,async(req,res)=>{const u=await dbGet('SELECT id,name,email,phone,created_at FROM users WHERE id=?',[req.user.id]);if(!u)return res.status(404).json({error:'Account not found'});res.json(u)});
app.get('/api/my-tickets',authUser,async(req,res)=>res.json(await dbAll('SELECT ticket_no,name,phone,payment_ref,status,created_at FROM tickets WHERE user_id=? ORDER BY id DESC',[req.user.id])));

app.post('/api/login',async(req,res)=>{const {username,password}=req.body;const a=await dbGet('SELECT * FROM admins WHERE username=?',[username]);if(!a||!bcrypt.compareSync(password||'',a.password_hash))return res.status(401).json({error:'Invalid login'});res.json({token:jwt.sign({id:a.id,username:a.username,role:'admin'},secret(),{expiresIn:'8h'})});});
app.patch('/api/admin/settings',authAdmin,async(req,res)=>{const {event_name,event_date,venue,ticket_price,payment_number,tagline}=req.body;if(!event_name||!event_date||!venue||!ticket_price||!payment_number||!tagline)return res.status(400).json({error:'All website settings are required'});await dbRun('UPDATE settings SET event_name=?,event_date=?,venue=?,ticket_price=?,payment_number=?,tagline=? WHERE id=1',[event_name,event_date,venue,ticket_price,payment_number,tagline]);res.json({ok:true});});

app.post('/api/tickets',authUser,async(req,res)=>{const {name,phone,paymentRef}=req.body;if(!name||!phone||!paymentRef)return res.status(400).json({error:'All fields are required'});let no;do{no='APM-'+Math.random().toString(36).slice(2,8).toUpperCase()}while(await dbGet('SELECT id FROM tickets WHERE ticket_no=?',[no]));await dbRun('INSERT INTO tickets(user_id,name,phone,payment_ref,ticket_no) VALUES(?,?,?,?,?)',[req.user.id,name,phone,paymentRef,no]);res.json({ticketNo:no,status:'Pending'});});
app.get('/api/tickets/:ticketNo',async(req,res)=>{const t=await dbGet('SELECT ticket_no,name,status,created_at FROM tickets WHERE ticket_no=?',[req.params.ticketNo]);if(!t)return res.status(404).json({error:'Ticket not found'});res.json(t)});
app.get('/api/admin/tickets',authAdmin,async(req,res)=>res.json(await dbAll('SELECT * FROM tickets ORDER BY id DESC')));
app.patch('/api/admin/tickets/:id',authAdmin,async(req,res)=>{const s=req.body.status;if(!['Pending','Approved','Rejected','Used'].includes(s))return res.status(400).json({error:'Invalid status'});await dbRun('UPDATE tickets SET status=? WHERE id=?',[s,req.params.id]);res.json({ok:true});});
app.delete('/api/admin/tickets/:id',authAdmin,async(req,res)=>{await dbRun('DELETE FROM tickets WHERE id=?',[req.params.id]);res.json({ok:true});});
app.get('/api/admin/stats',authAdmin,async(req,res)=>res.json({total:(await dbGet('SELECT COUNT(*) c FROM tickets')).c,pending:(await dbGet("SELECT COUNT(*) c FROM tickets WHERE status='Pending'")).c,approved:(await dbGet("SELECT COUNT(*) c FROM tickets WHERE status='Approved'")).c,used:(await dbGet("SELECT COUNT(*) c FROM tickets WHERE status='Used'")).c,users:(await dbGet('SELECT COUNT(*) c FROM users')).c}));
app.get('/api/admin/users',authAdmin,async(req,res)=>res.json(await dbAll('SELECT id,name,email,phone,created_at FROM users ORDER BY id DESC')));
app.post('/api/messages',async(req,res)=>{const {name,message}=req.body;if(!name||!message)return res.status(400).json({error:'Missing fields'});await dbRun('INSERT INTO messages(name,message) VALUES(?,?)',[name,message]);res.json({ok:true});});
app.get('/api/messages',async(req,res)=>res.json((await dbAll('SELECT name,message,created_at FROM messages ORDER BY id DESC LIMIT 50')).reverse()));
app.get('/api/ticket/:ticketNo/qr',async(req,res)=>{try{const t=await dbGet('SELECT ticket_no,status FROM tickets WHERE ticket_no=?',[req.params.ticketNo]);if(!t)return res.status(404).end();res.json({qr:await QRCode.toDataURL(JSON.stringify({ticketNo:t.ticket_no,status:t.status}))})}catch(e){res.status(500).json({error:'QR generation failed'})}});
app.use((req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
initDb().then(()=>app.listen(PORT,()=>console.log(`Party website running on port ${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
