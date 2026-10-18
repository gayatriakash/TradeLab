import {
  auth, db, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, doc, setDoc, getDoc, serverTimestamp,
  RecaptchaVerifier, linkWithPhoneNumber
} from "./firebase.js";

const ASSETS = {
  TECH: {type:"Stock", base:100, drift:.0005, vol:.018},
  BANK: {type:"Stock", base:145, drift:.0003, vol:.014},
  GOLD: {type:"Commodity", base:210, drift:.0002, vol:.009},
  BOND: {type:"Bond", base:102, drift:.0001, vol:.004},
  BTC: {type:"Crypto", base:62000, drift:.0008, vol:.035}
};

let market = {};
let selectedAssets = ["TECH","BANK","BTC"];
let currentUser = null;
let portfolio = {
  cash: 100000,
  holdings: {},
  history: [],
  strategy: null,
  preferences: {chartType:"line", range:100}
};

const $ = id => document.getElementById(id);
const money = n => "$" + Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const num = n => Number(n).toLocaleString("en-US",{maximumFractionDigits:2});

function generateAsset(key, count=180){
  const s = ASSETS[key];
  let price=s.base, rows=[];
  for(let i=0;i<count;i++){
    const open=price;
    const change=(Math.random()-.5)*2*s.vol+s.drift;
    const close=Math.max(.01,open*(1+change));
    const high=Math.max(open,close)*(1+Math.random()*s.vol*.7);
    const low=Math.min(open,close)*(1-Math.random()*s.vol*.7);
    price=close;
    rows.push({open,high,low,close,time:i});
  }
  return rows;
}
function generateMarket(){
  market={};
  Object.keys(ASSETS).forEach(k=>market[k]=generateAsset(k));
  renderAll();
}
function closes(key){ return market[key].map(x=>x.close); }
function sma(values,p){
  return values.map((_,i)=>{
    if(i<p-1)return null;
    let a=values.slice(i-p+1,i+1);
    return a.reduce((x,y)=>x+y,0)/p;
  });
}
function std(values,p){
  return values.map((_,i)=>{
    if(i<p-1)return null;
    const a=values.slice(i-p+1,i+1), m=a.reduce((x,y)=>x+y,0)/p;
    return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/p);
  });
}
function rsi(values,p=14){
  let out=Array(values.length).fill(null), gains=[], losses=[];
  for(let i=1;i<values.length;i++){let d=values[i]-values[i-1];gains.push(Math.max(d,0));losses.push(Math.max(-d,0));}
  for(let i=p;i<values.length;i++){
    const g=gains.slice(i-p,i).reduce((a,b)=>a+b,0)/p;
    const l=losses.slice(i-p,i).reduce((a,b)=>a+b,0)/p;
    out[i]=l===0?100:100-(100/(1+g/l));
  }
  return out;
}
function volatility(values,p=20){
  if(values.length<p+1)return 0;
  let rs=[];
  for(let i=1;i<values.length;i++)rs.push(Math.log(values[i]/values[i-1]));
  const a=rs.slice(-p), m=a.reduce((x,y)=>x+y,0)/a.length;
  return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length)*Math.sqrt(252)*100;
}
function calculateIndicators(key){
  const c=closes(key), mp=+$("maPeriod").value||20, rp=+$("rsiPeriod").value||14, bp=+$("bbPeriod").value||20, bs=+$("bbStd").value||2;
  const ma=sma(c,mp), sd=std(c,bp);
  return {ma,rsi:rsi(c,rp),upper:ma.map((v,i)=>v==null||sd[i]==null?null:v+bs*sd[i]),lower:ma.map((v,i)=>v==null||sd[i]==null?null:v-bs*sd[i])};
}
function drawChart(){
  const canvas=$("marketCanvas"), ctx=canvas.getContext("2d"), rect=canvas.getBoundingClientRect();
  canvas.width=Math.max(700,rect.width*devicePixelRatio); canvas.height=420*devicePixelRatio; ctx.scale(devicePixelRatio,devicePixelRatio);
  const w=rect.width,h=420, keys=selectedAssets, range=+$("rangeSelect").value;
  ctx.clearRect(0,0,w,h);
  const all=keys.flatMap(k=>closes(k).slice(-range)); let min=Math.min(...all),max=Math.max(...all);
  if($("chartType").value!=="candlestick"){min*=.96;max*=1.04;}
  const x=i=>(i/(range-1))*w, y=v=>h-25-((v-min)/(max-min))*(h-45);
  ctx.strokeStyle="#252b36"; ctx.fillStyle="#8d96a4"; ctx.font="12px Inter";
  for(let g=0;g<5;g++){const yy=25+g*80;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke();ctx.fillText(num(max-(max-min)*g/4),5,yy-5);}
  if($("chartType").value==="candlestick"){
    const key=keys[0], data=market[key].slice(-range), bw=Math.max(2,w/range*.55);
    data.forEach((d,i)=>{const xx=x(i), up=d.close>=d.open;ctx.strokeStyle=up?"#43d17e":"#ef707d";ctx.fillStyle=ctx.strokeStyle;
      ctx.beginPath();ctx.moveTo(xx,y(d.high));ctx.lineTo(xx,y(d.low));ctx.stroke();
      ctx.fillRect(xx-bw/2,y(Math.max(d.open,d.close)),bw,Math.max(1,Math.abs(y(d.open)-y(d.close))));
    });
  } else {
    keys.forEach((key,idx)=>{
      const data=closes(key).slice(-range), base=data[0]||1;
      ctx.strokeStyle=["#e7b84b","#64b5ff","#d98cff","#5de0c1","#ff8e72"][idx%5];
      ctx.lineWidth=2;ctx.beginPath();
      data.forEach((v,i)=>{const normalized=v/base*ASSETS[key].base;const xx=x(i),yy=y(normalized);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});
      ctx.stroke();
    });
  }
}
function renderAssetToggles(){
  $("assetToggles").innerHTML=Object.keys(ASSETS).map(k=>`<button class="asset-chip ${selectedAssets.includes(k)?"active":""}" data-asset="${k}">${k} · ${ASSETS[k].type}</button>`).join("");
  document.querySelectorAll(".asset-chip").forEach(b=>b.onclick=()=>{const k=b.dataset.asset;selectedAssets=selectedAssets.includes(k)?selectedAssets.filter(x=>x!==k):[...selectedAssets,k];if(!selectedAssets.length)selectedAssets=[k];renderAll()});
  $("tradeAsset").innerHTML=Object.keys(ASSETS).map(k=>`<option value="${k}">${k}</option>`).join("");
  $("analyticsAsset").innerHTML=Object.keys(ASSETS).map(k=>`<option value="${k}">${k}</option>`).join("");
}
function renderDashboard(){
  const key=selectedAssets[0], data=market[key], price=data.at(-1).close, rr=rsi(closes(key),14).at(-1);
  $("mainPrice").textContent=money(price);$("mainAsset").textContent=key;$("mainRsi").textContent=rr?rr.toFixed(1):"—";
  const pv=portfolioValue(), pnl=pv-100000;
  $("portfolioValue").textContent=money(pv);$("cashValue").textContent=money(portfolio.cash);
  $("portfolioPnl").textContent=(pnl>=0?"+":"")+money(pnl);
}
function portfolioValue(){
  return portfolio.cash+Object.entries(portfolio.holdings).reduce((sum,[k,h])=>sum+(h.qty*(market[k]?.at(-1)?.close||h.avgCost)),0);
}
function trade(action){
  const key=$("tradeAsset").value, qty=+$("tradeQty").value, price=market[key].at(-1).close, fee=price*qty*.001, gross=price*qty;
  if(!qty||qty<1)return alert("Enter a valid quantity.");
  if(action==="BUY"){
    if(portfolio.cash<gross+fee)return alert("Not enough simulated cash.");
    const h=portfolio.holdings[key]||{qty:0,avgCost:0};
    h.avgCost=((h.qty*h.avgCost)+gross+fee)/(h.qty+qty);h.qty+=qty;portfolio.holdings[key]=h;portfolio.cash-=gross+fee;
  }else{
    const h=portfolio.holdings[key];if(!h||h.qty<qty)return alert("Not enough shares to sell.");
    h.qty-=qty;portfolio.cash+=gross-fee;if(h.qty===0)delete portfolio.holdings[key];
  }
  portfolio.history.unshift({time:new Date().toLocaleString(),action,key,qty,price,total:gross});
  saveUserData();renderAll();
}
function renderPortfolio(){
  $("holdingsBody").innerHTML=Object.entries(portfolio.holdings).map(([k,h])=>{
    const p=market[k].at(-1).close,mv=h.qty*p,pl=mv-h.qty*h.avgCost;
    return `<tr><td>${k}</td><td>${num(h.qty)}</td><td>${money(h.avgCost)}</td><td>${money(p)}</td><td>${money(mv)}</td><td>${pl>=0?"+":""}${money(pl)}</td></tr>`;
  }).join("")||`<tr><td colspan="6">No holdings yet. Try a simulated BUY.</td></tr>`;
  $("tradeHistoryBody").innerHTML=portfolio.history.slice(0,30).map(t=>`<tr><td>${t.time}</td><td>${t.action}</td><td>${t.key}</td><td>${num(t.qty)}</td><td>${money(t.price)}</td><td>${money(t.total)}</td></tr>`).join("")||`<tr><td colspan="6">No trades yet.</td></tr>`;
  const holdings=Object.values(portfolio.holdings).reduce((a,h)=>a+h.qty,0);
  $("portfolioSummary").innerHTML=[["Total Value",money(portfolioValue())],["Cash",money(portfolio.cash)],["Positions",num(holdings)],["Trades",portfolio.history.length]].map(x=>`<div class="stat"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join("");
}
function runStrategy(){
  const key=selectedAssets[0], c=closes(key), ind=calculateIndicators(key), type=$("strategySelect").value;
  let cash=100000, shares=0,trades=0;
  for(let i=1;i<c.length;i++){
    let buy=false,sell=false;
    if(type==="ma"&&ind.ma[i]&&ind.ma[i-1]){buy=c[i]>ind.ma[i]&&c[i-1]<=ind.ma[i-1];sell=c[i]<ind.ma[i]&&c[i-1]>=ind.ma[i-1]}
    if(type==="rsi"&&ind.rsi[i]!=null){buy=ind.rsi[i]<30;sell=ind.rsi[i]>70}
    if(type==="bb"&&ind.lower[i]!=null){buy=c[i]<ind.lower[i];sell=c[i]>ind.upper[i]}
    if(buy&&shares===0){shares=Math.floor(cash/c[i]);cash-=shares*c[i];trades++}
    if(sell&&shares>0){cash+=shares*c[i];shares=0;trades++}
  }
  const final=c.at(-1)*shares+cash, ret=(final/100000-1)*100;
  portfolio.strategy={type,return:ret,trades,key};saveUserData();
  $("strategyResult").innerHTML=`<b>${key}</b> simulation complete. Final simulated value: <b>${money(final)}</b> (${ret.toFixed(2)}%).`;
  $("strategyStats").innerHTML=[["Strategy",type.toUpperCase()],["Asset",key],["Return",ret.toFixed(2)+"%"],["Trades",trades]].map(x=>`<div class="stat"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join("");
}
function detectPatterns(key){
  const d=market[key], found=[];
  for(let i=1;i<d.length;i++){
    const x=d[i],p=d[i-1], body=Math.abs(x.close-x.open), range=x.high-x.low, upper=x.high-Math.max(x.open,x.close), lower=Math.min(x.open,x.close)-x.low;
    if(range&&body/range<.1)found.push({i,name:"Doji",desc:"Open and close are very close, showing market indecision."});
    if(lower>body*2&&upper<body*.8)found.push({i,name:"Hammer",desc:"Long lower shadow with a small body; often studied as a possible reversal signal."});
    if(p.close<p.open&&x.close>x.open&&x.open<=p.close&&x.close>=p.open)found.push({i,name:"Bullish Engulfing",desc:"The current bullish body covers the previous bearish body."});
    if(p.close>p.open&&x.close<x.open&&x.open>=p.close&&x.close<=p.open)found.push({i,name:"Bearish Engulfing",desc:"The current bearish body covers the previous bullish body."});
  }
  return found.slice(-30).reverse();
}
function renderPatterns(){
  const filter=$("patternFilter").value,key=selectedAssets[0],all=detectPatterns(key),found=filter==="all"?all:all.filter(x=>x.name===filter);
  $("patternList").innerHTML=found.length?found.map(x=>`<div class="pattern-card"><h3>${x.name} · Candle ${x.i}</h3><p>${x.desc}</p></div>`).join(""):`<div class="pattern-card"><h3>No matching pattern</h3><p>Generate new market data or choose another filter.</p></div>`;
}
function renderAnalytics(){
  const key=$("analyticsAsset").value||selectedAssets[0];
  const p=+$("analyticsPeriod").value||20;
  const c=closes(key);

  const ma=sma(c,p).at(-1);
  const vol=volatility(c,p);
  const rr=rsi(c,p).at(-1);
  const ret=((c.at(-1)/c[Math.max(0,c.length-p)]-1)*100);

  $("analyticsMa").textContent=ma?money(ma):"—";
  $("analyticsVol").textContent=vol.toFixed(2)+"%";
  $("analyticsRsi").textContent=rr?rr.toFixed(1):"—";
  $("analyticsReturn").textContent=ret.toFixed(2)+"%";

  $("analyticsExplanation").innerHTML=
    `<b>${key}</b> analysis: the ${p}-period moving average estimates the recent trend, volatility estimates annualized price variability, RSI measures momentum, and return compares the latest price with the price ${p} periods earlier. These are educational metrics calculated from the simulator's generated data.`;

  $("maCard").style.display =
  $("toggleMA").checked ? "" : "none";

$("volCard").style.display =
  $("toggleVolatility").checked ? "" : "none";

$("rsiCard").style.display =
  $("toggleRSI").checked ? "" : "none";

$("returnCard").style.display =
  $("toggleReturn").checked ? "" : "none";
}
async function saveUserData(){
  if(!currentUser)return;
  try{await setDoc(doc(db,"users",currentUser.uid),{portfolio,preferences:portfolio.preferences,updatedAt:serverTimestamp()},{merge:true});}
  catch(e){console.error("Firestore save failed:",e);}
}
async function loadUserData(user){
  currentUser=user;
  if(!user){$("userLabel").textContent="Guest";$("loginBtn").classList.remove("hidden");$("logoutBtn").classList.add("hidden");return;}
  $("userLabel").textContent=user.email;$("loginBtn").classList.add("hidden");$("logoutBtn").classList.remove("hidden");
  try{const snap=await getDoc(doc(db,"users",user.uid));if(snap.exists()){const d=snap.data();if(d.portfolio)portfolio=d.portfolio;}}catch(e){console.error("Firestore load failed:",e)}
  renderAll();
}
function renderAll(){renderAssetToggles();renderDashboard();renderPortfolio();renderPatterns();renderAnalytics();drawChart()}

document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>{document.querySelectorAll(".nav-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));$(b.dataset.section).classList.add("active");setTimeout(drawChart,50)});
$("generateBtn").onclick=generateMarket;
$("chartType").onchange=()=>{portfolio.preferences.chartType=$("chartType").value;saveUserData();drawChart()};
$("rangeSelect").onchange=()=>{portfolio.preferences.range=+$("rangeSelect").value;saveUserData();drawChart()};
$("applyIndicators").onclick=()=>{renderAnalytics();drawChart()};
$("runStrategy").onclick=runStrategy;
$("scanPatterns").onclick=renderPatterns;
$("patternFilter").onchange=renderPatterns;
$("analyticsAsset").onchange=renderAnalytics;
$("analyticsPeriod").oninput=renderAnalytics;
$("buyBtn").onclick=()=>trade("BUY");$("sellBtn").onclick=()=>trade("SELL");

const dialog = $("authDialog");

let loginMode = true;
let confirmationResult = null;
let recaptchaVerifier = null;


// =========================
// AUTH MODE
// =========================

function setAuthMode() {

  $("authTitle").textContent =
    loginMode ? "Login" : "Create Account";

  $("authDescription").textContent =
    loginMode
      ? "Login to access your TradeLab portfolio."
      : "Create your TradeLab account to save your portfolio, preferences and strategies.";

  // Username
  $("authUsername").style.display =
    loginMode ? "none" : "block";

  $("authUsername").required =
    !loginMode;

  // Phone
  $("authPhone").style.display =
    loginMode ? "none" : "block";

  $("authPhone").required =
    !loginMode;

  // CAPTCHA
  $("recaptcha-container").style.display =
    loginMode ? "none" : "block";

  // OTP
  $("otpSection").style.display = "none";

  // Main button
  $("sendOtpBtn").textContent =
    loginMode ? "Login" : "Send OTP";

  $("switchAuth").textContent =
    loginMode
      ? "Create account instead"
      : "Already have an account? Login";

  $("authMessage").textContent = "";
}


// =========================
// OPEN LOGIN
// =========================

$("loginBtn").onclick = () => {

  loginMode = true;

  setAuthMode();

  dialog.showModal();
};


// =========================
// LOGOUT
// =========================

$("logoutBtn").onclick = () => {
  signOut(auth);
};


// =========================
// CLOSE
// =========================

$("closeAuth").onclick = () => {
  dialog.close();
};


// =========================
// SWITCH LOGIN / CREATE
// =========================

$("switchAuth").onclick = () => {

  loginMode = !loginMode;

  setAuthMode();
};


// =========================
// LOGIN / SEND OTP
// =========================

$("sendOtpBtn").onclick = async () => {

  $("authMessage").textContent = "Working...";

  try {

    const email =
      $("authEmail").value.trim();

    const password =
      $("authPassword").value;

    // -------------------------
    // LOGIN
    // -------------------------

    if (loginMode) {

      if (!email || !password) {

        $("authMessage").textContent =
          "Please enter email and password.";

        return;
      }

      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      $("authMessage").textContent =
        "Login successful!";

      setTimeout(() => {

        dialog.close();

        $("authForm").reset();

      }, 700);

      return;
    }


    // -------------------------
    // CREATE ACCOUNT
    // -------------------------

    const username =
      $("authUsername").value.trim();

    let phone =
      $("authPhone").value.trim();


    if (!username) {

      $("authMessage").textContent =
        "Please enter username.";

      return;
    }


    if (!email) {

      $("authMessage").textContent =
        "Please enter email.";

      return;
    }


    if (password.length < 6) {

      $("authMessage").textContent =
        "Password must be at least 6 characters.";

      return;
    }


    // Clean phone number
    phone = phone.replace(/\s+/g, "");


    // Convert 10 digit number to +91
    if (/^[6-9]\d{9}$/.test(phone)) {

      phone = "+91" + phone;
    }


    if (!/^\+91[6-9]\d{9}$/.test(phone)) {

      $("authMessage").textContent =
        "Enter a valid Indian phone number.";

      return;
    }


    // -------------------------
    // CREATE EMAIL ACCOUNT
    // -------------------------

    $("authMessage").textContent =
      "Creating account...";


    const userCredential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );


    const user =
      userCredential.user;


    // -------------------------
    // CAPTCHA
    // -------------------------

    if (!recaptchaVerifier) {

      recaptchaVerifier =
        new RecaptchaVerifier(
          auth,
          "recaptcha-container",
          {
            size: "normal"
          }
        );
    }


    $("authMessage").textContent =
      "Sending OTP...";


    // -------------------------
    // SEND PHONE OTP
    // -------------------------

    confirmationResult =
      await linkWithPhoneNumber(
        user,
        phone,
        recaptchaVerifier
      );


    $("otpSection").style.display =
      "block";


    $("authMessage").textContent =
      "OTP sent! Enter the 6-digit OTP.";

  }

  catch (err) {

    console.error(err);

    $("authMessage").textContent =
      err.message.replace(
        "Firebase: ",
        ""
      );

  }

};


// =========================
// VERIFY OTP
// =========================

$("verifyOtpBtn").onclick = async () => {

  const otp =
    $("authOtp").value.trim();


  if (!confirmationResult) {

    $("authMessage").textContent =
      "Please send OTP first.";

    return;
  }


  if (!/^\d{6}$/.test(otp)) {

    $("authMessage").textContent =
      "Please enter a valid 6-digit OTP.";

    return;
  }


  try {

    $("authMessage").textContent =
      "Verifying OTP...";


    await confirmationResult.confirm(otp);


    const user =
      auth.currentUser;


    // -------------------------
    // SAVE USER DATA
    // -------------------------

    await setDoc(
      doc(db, "users", user.uid),
      {
        username:
          $("authUsername").value.trim(),

        email:
          user.email,

        phone:
          $("authPhone").value.trim(),

        portfolio:
          portfolio,

        preferences:
          portfolio.preferences,

        updatedAt:
          serverTimestamp()
      },
      {
        merge: true
      }
    );


    $("authMessage").textContent =
      "Account created successfully!";


    setTimeout(() => {

      dialog.close();

      $("authForm").reset();

      $("otpSection").style.display =
        "none";

      confirmationResult = null;

    }, 1000);

  }

  catch (err) {

    console.error(err);

    $("authMessage").textContent =
      err.message.replace(
        "Firebase: ",
        ""
      );

  }

};


setAuthMode();

onAuthStateChanged(auth,loadUserData);
generateMarket();
document.addEventListener("DOMContentLoaded", () => {
  ["toggleMA", "toggleVolatility", "toggleRSI", "toggleReturn"].forEach(id => {
    const checkbox = $(id);

    if (checkbox) {
      checkbox.addEventListener("change", renderAnalytics);
    }
  });
});