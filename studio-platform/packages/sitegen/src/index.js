// Studio site generator. Draft (plain JSON) in, one HTML page out.
// Extracted from prototype/studio-platform.html. Pure functions: no browser, no network.
//
//   import { gen, seed } from "@studio/sitegen";
//   const draft = seed("con", "Acme Builders");   // starter draft for a niche
//   const html = gen(draft);                      // finished page
//
// RT (price calculator) and GR (Google reviews) are serialised into the published page
// with Function.prototype.toString(), so they must stay self-contained.
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ink=h=>{const n=parseInt(h.slice(1),16);return((n>>16)*299+(n>>8&255)*587+(n&255)*114)/1000>150?"#111":"#fff"};
const OLD={
custom:{n:"Custom",h:"",t:"",a:"",s:""},
trades:{n:"Trades (plumbing, electrical)",h:"Fast, reliable repairs when you need them",t:"Licensed local tradespeople. Same-day call-outs.",a:"We are a local team that fixes problems properly the first time. Honest quotes, tidy work and no surprises on the invoice.",s:"Emergency call-outs|Available when things go wrong, day or night.\nInstallations|New fittings, geysers and wiring done to code.\nMaintenance|Regular checks that prevent expensive breakdowns."},
food:{n:"Restaurant or café",h:"Good food, made fresh every day",t:"Breakfast, lunch and coffee in the heart of the neighbourhood.",a:"Our kitchen cooks with fresh local ingredients and serves it with a smile. Drop in, bring friends, or order ahead.",s:"Breakfast|Hearty plates and proper coffee to start your day.\nLunch|Fresh, filling meals at fair prices.\nCatering|Platters and events for any group size."},
beauty:{n:"Salon or barber",h:"Look good. Feel even better.",t:"Cuts, colour and grooming by people who care.",a:"A relaxed, friendly space where every client leaves happy. Walk-ins welcome and bookings available.",s:"Cuts and styling|Tailored to you, from classic to modern.\nColour|Professional colour with healthy results.\nGrooming|Beards, shaves and finishing touches."},
fitness:{n:"Gym or personal trainer",h:"Train smarter. Get stronger.",t:"Coaching and classes for every fitness level.",a:"We help real people build real strength with clear programmes, honest coaching and a supportive community.",s:"Personal training|One-on-one plans built around your goals.\nGroup classes|High energy sessions that keep you motivated.\nNutrition guidance|Simple advice that fits your routine."},
pro:{n:"Professional services",h:"Clear advice you can rely on",t:"Practical, personal service for individuals and businesses.",a:"We keep things simple: plain language, fair fees and prompt responses. Your matters are handled with care and discretion.",s:"Consultations|A focused first meeting to understand your needs.\nOngoing support|Reliable help whenever you need it.\nCompliance|Stay on the right side of the rules."}
};

const N=[
["con","Trades","Construction","indus","#ffb400","Built right. Built to last.","Residential and commercial construction, renovations and project management.","From foundations to finishing touches, we deliver on time and on budget. Clear quotes, qualified crews and site managers who pick up the phone.","New builds|Houses, extensions and commercial units from plan to handover.\nRenovations|Kitchens, bathrooms and full refurbishments done properly.\nProject management|One point of contact, one schedule, no surprises.","What we build"],
["trades","Trades","Electrical and plumbing","neon","#e8a317",OLD.trades.h,OLD.trades.t,OLD.trades.a,OLD.trades.s,"What we do"],
["ret","Business","Retail store","pop","#ff2e93","New in. Going fast.","Fashion, gifts and everyday finds, in store and online.","A local shop with a hand-picked range, fair prices and staff who know their stock. Pop in or order online and we will deliver.","New arrivals|Fresh stock every week, in limited runs.\nGift ideas|Something for everyone, wrapped free.\nDelivery and collection|Order online, then collect in store or have it delivered.","Shop"],
["bnk","Business","Banking and finance","fin","#00d1b2","Money that moves with you","Business and personal banking, loans and savings without the queues.","Straightforward accounts, transparent fees and advisers who explain things in plain language. Bank in branch, online or on your phone.","Everyday accounts|Low fees, instant notifications and no hidden charges.\nLoans and credit|Fair rates and quick decisions for people and businesses.\nSavings and investments|Clear, flexible options that grow what you earn.","What we offer"],
["law","Business","Law firm","noir","#c9a24b","Counsel you can trust","Attorneys for individuals, families and businesses.","We give clear advice, fair fees and prompt answers. Every matter is handled with care, discretion and the full weight of our experience.","Commercial law|Contracts, disputes and compliance for growing businesses.\nFamily and estates|Wills, divorce and trusts handled with sensitivity.\nProperty|Transfers, leases and conveyancing without the delays.","Practice areas"],
["it","Business","IT services","term","#00ff9c","Tech that just works","Managed IT, networks, security and support for small business.","We keep your systems fast, secure and backed up so you can focus on the work. Quick response times, plain-language advice and fixed monthly pricing.","Managed support|Helpdesk, monitoring and updates for every device.\nCyber security|Firewalls, backups and training that stop attacks.\nCloud and networks|Email, storage and Wi-Fi set up properly the first time.","What we do"],
["ita","Food","Italian","trat","#e63b2e","Made the Italian way","Wood-fired pizza, fresh pasta and good wine.","Family recipes, simple ingredients and a table that feels like home. Come hungry and stay for dessert.","Pizza|Wood-fired, thin-crust and loaded with fresh toppings.\nPasta|Handmade daily and sauced to order.\nDolci|Tiramisu, panna cotta and proper espresso.","Menu"],
["jpn","Food","Japanese","jap","#e5382a","Fresh, precise, unhurried","Sushi, ramen and izakaya plates.","Seasonal fish, careful knife work and quiet attention to detail. Sit at the counter and let us look after you.","Sushi and sashimi|Cut to order from the freshest catch.\nRamen|Slow-simmered broth with house-made noodles.\nIzakaya plates|Small dishes made for sharing.","Menu"],
["indi","Food","Indian","indi","#ff9f1c","Rich spice. Real tradition.","Curries, tandoor and street food made from scratch.","Recipes handed down through generations, freshly ground spices and slow cooking. Warm, generous and full of flavour.","Curries|Butter chicken, lamb rogan josh, paneer and more.\nTandoor and biryani|Charred, smoky and fragrant.\nStreet food|Samosas, chaats and fresh roti.","Menu"],
["mex","Food","Mexican","mex","#ff3d81","Tacos, fire and good company","Street-style Mexican with fresh salsas and cold drinks.","Handmade tortillas, slow-cooked meats and salsas with real heat. Loud, colourful and made for sharing.","Tacos|Pork pastor, grilled chicken and veggie fillings.\nBurritos and bowls|Big, filling and built your way.\nSalsas and sides|Guacamole, elote and nachos for the table.","Menu"],
["chn","Food","Chinese","chi","#e60012","Dim sum, wok and tradition","Cantonese and Sichuan classics, dine in or take away.","Hot woks, fresh ingredients and family-style sharing dishes. Order a few plates and pass them around the table.","Dim sum|Steamed dumplings, buns and rice rolls.\nWok dishes|Fast, fiery and full of flavour.\nNoodles and rice|Comfort food done the traditional way.","Menu"],
["mid","Food","Middle Eastern","mide","#d9a441","Warm bread, slow fire, shared plates","Lebanese and Levantine food, made fresh daily.","Charcoal grills, mezze for the table and sweet mint tea to finish. Generous portions and a welcome for everyone.","Mezze|Hummus, baba ganoush and warm flatbread.\nGrills|Shawarma, kebabs and shish taouk off the coals.\nSweets|Baklava, knafeh and fresh mint tea.","Menu"],
["sa","Food","South African braai","afr","#e07b00","Fire, meat and good times","Braai, shisa nyama and Cape flavours.","Cooked over coals the way it should be. Bring the family, bring the music and stay as long as you like.","Braai platters|Boerewors, lamb chops, chicken and steak.\nPap and sides|Chakalaka, pap, morogo and fresh salads.\nCape Malay|Bobotie, curries and koeksisters.","Menu"],
["dnr","Food","American grill","diner","#ff3b30","Big burgers. No apologies.","Burgers, ribs, shakes and fries.","Hand-pressed patties, hot grills and thick milkshakes. A proper diner with proper portions.","Burgers|Stacked high with all the toppings.\nRibs and wings|Smoked, sticky and finger-licking good.\nShakes and sides|Thick shakes, loaded fries and onion rings.","Menu"],
["caf","Food","Café and bakery","cafe","#e0a15c","Baked this morning","Coffee, fresh bread and pastries.","A neighbourhood café with proper coffee, warm bakes and a quiet corner with your name on it. Takeaway and dine-in.","Coffee|Single-origin espresso, filter and cold brew.\nBakes|Croissants, sourdough and cakes baked daily.\nBreakfast and lunch|Light, fresh plates all day.","Menu"],
["nls","Beauty","Nails","candy","#ff5fb7","Nails you can’t stop looking at","Gel, acrylic and nail art by appointment.","A clean, friendly studio where every set is made to last and made to match your style. Book online or send us a message.","Gel and acrylic|Strong, glossy sets in any length or shape.\nNail art|Chrome, French, 3D and fully custom designs.\nManicure and pedicure|Treatments that leave you feeling brand new.","Treatments"],
["mup","Beauty","Make-up artist","glam","#f2a2a5","Your best face, every time","Bridal, events and everyday make-up artistry.","Flawless, long-lasting make-up tailored to your features and your occasion. Trials available, on location or in studio.","Bridal|Trial and wedding-day looks that last all night.\nEvents and shoots|Glam for formals, parties and photo shoots.\nLessons|Learn the techniques and products that suit you.","Services"],
["lsh","Beauty","Lashes and brows","luxe","#d4af37","Wake up ready","Lash extensions, lifts and brow shaping.","Soft, natural-looking lashes and perfectly shaped brows, applied with precision in a calm, hygienic space.","Lash extensions|Classic, hybrid and volume sets.\nLash lift and tint|Natural curl and colour without extensions.\nBrow shaping|Wax, thread, tint and lamination.","Treatments"],
["hair","Beauty","Hair salon","chrome","#8b5cf6","Hair that turns heads","Cut, colour and style by people who listen.","Whether it’s a fresh cut or a full colour change, we take the time to get it right. Relaxed space, great products and honest advice.","Cuts and styling|Tailored to your face, hair type and lifestyle.\nColour and highlights|Balayage, blondes and bold colour done properly.\nTreatments|Keratin, braids, weaves and deep conditioning.","Services"],
["brb","Beauty","Barber","luxe","#c9a24b","Sharp cuts. Clean lines.","Haircuts, fades and beard trims. Walk-ins welcome.","Old-school craft with a modern edge. Good conversation, great cuts and a clean finish every time.","Cuts and fades|Classic, skin fade, taper and crop.\nBeard trims|Shaped, lined and finished with a hot towel.\nKids’ cuts|Patient, quick and always sharp.","Services"],
["spa","Beauty","Skin and spa","zen","#9bc4a4","Skin that glows","Facials, massage and skin treatments.","A quiet space to slow down. Results-driven skincare and relaxing treatments tailored to you.","Facials|Deep cleanse, hydration and glow treatments.\nMassage|Relaxing, deep-tissue and hot stone options.\nSkin care|Peels, waxing and take-home routines.","Treatments"],
["fit","Other","Gym or personal trainer","neon","#00e5ff",OLD.fitness.h,OLD.fitness.t,OLD.fitness.a,OLD.fitness.s,"What we do"]
];
const IND=Object.fromEntries([["custom",{g:"Start from scratch",n:"Custom",f:"neon",c:"#00e5ff",h:"",t:"",a:"",s:"",m:""}],...N.map(r=>[r[0],{g:r[1],n:r[2],f:r[3],c:r[4],h:r[5],t:r[6],a:r[7],s:r[8],m:r[9]}])]);

function hue(h){const n=parseInt(h.slice(1),16),R=(n>>16)/255,G=(n>>8&255)/255,B=(n&255)/255,x=Math.max(R,G,B),m=x-Math.min(R,G,B);if(!m)return 190;const H=x===R?(G-B)/m+(G<B?6:0):x===G?(B-R)/m+2:(R-G)/m+4;return Math.round(H*60)%360}

const parseQ=s=>{const q={t:"",cur:"R",vat:0,base:0,min:0,note:"This is an estimate only. We will confirm the final price with you.",ms:[],ls:[]};
 s.split("\n").forEach(r=>{const x=r.split("|");({
  t:()=>q.t=x[1],n:()=>q.note=x[1],b:()=>q.base=+x[1],x:()=>q.min=+x[1],v:()=>q.vat=+x[1],
  m:()=>q.ms.push({n:x[1],u:x[2],a:+x[3],b:+x[4],s:+x[5],v:+x[6]}),
  c:()=>q.ls.push({t:"c",n:x[1],r:+x[2],u:x[3],m:x[4]?x[4].split(",").map(Number):[],fr:+x[5]||0}),
  a:()=>q.ls.push({t:"a",n:x[1],r:+x[2]}),
  q:()=>q.ls.push({t:"q",n:x[1],r:+x[2],max:+x[3]||10}),
  p:()=>q.ls.push({t:"p",n:x[1],o:x[2].split(",").map(o=>{const y=o.split(":");return[y[0],+y[1]||0]})})
 }[x[0]]||(()=>0))()});
 return q};
const FOOD="n|We will confirm your order and the time by message.\np|Order type|Collection:0,Delivery:35";
const QS={
con:`t|Estimate your foundation
n|Sample rates. The final price is confirmed after a site visit.
x|9500
m|Length|m|1|40|0.5|10
m|Width|m|1|30|0.5|8
m|Depth|m|0.1|1|0.05|0.2
m|Distance from our yard|km|0|300|1|25
c|Concrete, supplied and poured|3200|m³|0,1,2
c|Reinforcement mesh|120|m²|0,1
c|Excavation and levelling|180|m²|0,1
c|Travel to your site (first 10 km free)|18|km|3|10
q|Cement bags (50 kg)|135|200
a|Concrete pump hire|2800
a|Waterproofing membrane|4500
p|Foundation type|Strip footing:0,Raft slab:8500,Piled:26000`,
trades:`t|Estimate your job
b|650
x|950
m|Distance from our workshop|km|0|100|1|10
c|Travel (first 10 km free)|16|km|0|10
q|Plug points|450|30
q|Light points|380|30
q|Distribution board upgrade|4800|3
a|Compliance certificate (CoC)|1200
p|When|Standard:0,Same day:650,After hours:1200`,
ret:`t|Build your order
q|Classic tee|249|20
q|Hoodie|599|10
q|Cap|189|10
q|Tote bag|129|10
a|Gift wrapping|40
p|Delivery|Collect in store:0,Courier (3 days):85,Express (next day):150`,
bnk:`t|Estimate your monthly banking fees
n|Fees are indicative. Terms and conditions apply.
p|Account|Starter:0,Business Plus:129,Business Pro:349
q|Extra debit cards|35|10
q|Extra user logins|49|20
a|Overdraft facility|79
p|Card machine|None:0,Mobile reader:199,Countertop:349`,
law:`t|Estimate your legal fees
p|Matter|Consultation only:850,Contract drafting:4500,Will and estate plan:3200,Property transfer:9500
q|Extra hours of advice|1850|40
a|Urgent turnaround (24 hours)|2500
a|Certified copies and filing|650`,
it:`t|Estimate your monthly IT support
m|Users|users|1|100|1|10
m|Devices|devices|1|150|1|12
c|Helpdesk support|180|per user|0
c|Device monitoring and patching|75|per device|1
a|Cyber security bundle|1200
a|Cloud backup|950
p|Response time|Next business day:0,Within 4 hours:1500,Within 1 hour:3500`,
ita:`t|Build your order
q|Margherita pizza|95|20
q|Pepperoni pizza|115|20
q|Spaghetti carbonara|105|20
q|Tiramisu|65|20
a|Extra mozzarella|25
${FOOD}`,
jpn:`t|Build your order
q|Salmon nigiri (2 pieces)|58|20
q|California roll (8 pieces)|72|20
q|Tonkotsu ramen|109|20
q|Edamame|42|20
a|Extra wasabi and ginger|0
${FOOD}`,
indi:`t|Build your order
q|Butter chicken|129|20
q|Lamb rogan josh|149|20
q|Garlic naan|28|20
q|Samosas (3)|45|20
p|Spice level|Mild:0,Medium:0,Hot:0
${FOOD}`,
mex:`t|Build your order
q|Tacos (3)|89|20
q|Burrito|99|20
q|Nachos with salsa|85|20
q|Guacamole|45|20
p|Heat|Mild:0,Hot:0,Extra hot:0
${FOOD}`,
chn:`t|Build your order
q|Dim sum basket (4)|68|20
q|Sweet and sour chicken|99|20
q|Beef chow mein|95|20
q|Spring rolls (4)|40|20
${FOOD}`,
mid:`t|Build your order
q|Mezze platter|129|20
q|Chicken shawarma wrap|79|20
q|Lamb kebab plate|139|20
q|Baklava (4)|55|20
a|Extra flatbread|15
${FOOD}`,
sa:`t|Build your order
q|Braai platter for two|289|20
q|Boerewors roll|55|20
q|Pap and chakalaka|35|20
q|Koeksisters (4)|40|20
${FOOD}`,
dnr:`t|Build your order
q|Classic burger|98|20
q|Cheese burger|108|20
q|Half rack of ribs|189|20
q|Milkshake|55|20
a|Add bacon|25
a|Loaded fries upgrade|30
${FOOD}`,
caf:`t|Build your order
q|Flat white|38|20
q|Croissant|32|20
q|Sourdough toastie|79|20
q|Chocolate brownie|45|20
p|Milk|Full cream:0,Oat:10,Almond:12
${FOOD}`,
nls:`t|Build your appointment
n|Final price confirmed at your appointment.
p|Base service|Gel manicure:260,Acrylic full set:380,Gel overlay:300,Pedicure:320
p|Length|Short:0,Medium:40,Long:80
q|Nail art (per nail)|15|10
a|Chrome finish|60
a|Soak-off and removal|80`,
mup:`t|Plan your look
m|Distance to your venue|km|0|100|1|10
p|Occasion|Everyday glam:450,Formal event:650,Bridal:1800,Photo shoot:900
a|Trial session|550
a|False lashes|120
q|Extra people in your party|450|10
c|Travel (first 10 km free)|12|km|0|10`,
lsh:`t|Build your appointment
p|Lash set|Classic:550,Hybrid:650,Volume:750,Mega volume:850
a|Lash lift and tint|380
a|Brow lamination|420
a|Brow wax and tint|180
a|Removal of old lashes|100`,
hair:`t|Build your appointment
p|Service|Cut and blow-dry:350,Full colour:900,Balayage:1800,Braids:700
p|Hair length|Short:0,Medium:150,Long:300
a|Deep conditioning treatment|250
a|Keratin treatment|1200
a|Extensions fitting|900`,
brb:`t|Build your visit
p|Cut|Classic cut:130,Skin fade:160,Taper fade:150
a|Beard trim|80
a|Hot towel shave|120
q|Kids’ cuts|100|5`,
spa:`t|Build your treatment
p|Treatment|Express facial:380,Deep cleanse facial:520,Massage (60 min):650,Hot stone massage:780
a|Full body scrub|320
a|Waxing add-on|220`,
fit:`t|Pick your membership
p|Plan|Monthly:450,Quarterly:1200,Annual:4200
q|Personal training sessions|350|20
a|Joining fee|250`
};


const CSSF={
ice:`.hero{background:radial-gradient(60% 90% at 88% 0,color-mix(in srgb,var(--b) 55%,transparent),transparent 70%),linear-gradient(180deg,color-mix(in srgb,var(--b) 16%,var(--bg)),var(--bg))}.hero h1{letter-spacing:-.02em}
.items{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}.it{background:var(--pn);border:1px solid color-mix(in srgb,var(--b) 45%,transparent);border-radius:14px;padding:24px;box-shadow:0 14px 34px -22px var(--a)}
h2:after{content:"";display:block;width:56px;height:3px;margin-top:14px;border-radius:3px;background:linear-gradient(90deg,var(--a),var(--b))}`,
menu:`.hero{text-align:center;padding:56px 0}.hero .w>div{border:1px solid var(--ln);outline:1px solid var(--ln);outline-offset:-10px;padding:64px 28px}.hero h1,.hero p{margin-left:auto;margin-right:auto}h2{text-align:center}h2:after{content:"";display:block;width:72px;height:2px;margin:14px auto 0;background:var(--a)}
.items{max-width:760px;margin:0 auto}.it{display:grid;grid-template-columns:1fr 2fr;gap:6px 24px;padding:18px 0;border-bottom:1px dashed color-mix(in srgb,var(--tx) 30%,transparent)}.it h3{color:var(--a)}.it p{margin:0}`,
glam:`.hero{text-align:center;background:radial-gradient(circle at 15% 0,color-mix(in srgb,var(--a) 22%,transparent),transparent 55%),radial-gradient(circle at 90% 100%,color-mix(in srgb,var(--b) 35%,transparent),transparent 55%)}.hero h1,.hero p{margin-left:auto;margin-right:auto}.hero h1{font-style:italic}h2{text-align:center}
.items{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:22px}.it{padding:30px 26px;border-radius:28px 28px 28px 6px;background:var(--pn);box-shadow:0 22px 44px -28px var(--a);text-align:center}`,
build:`.top{background:var(--tx);color:var(--bg)}.top .nav a{color:var(--a)}h1,h2,h3{text-transform:uppercase}.hero{background:var(--tx);color:var(--bg);border-bottom:14px solid;border-image:repeating-linear-gradient(135deg,var(--a) 0 18px,var(--tx) 18px 36px) 14}.hero p{color:color-mix(in srgb,var(--bg) 78%,var(--tx))}.hero h1,.hero .btn.alt{color:var(--bg)}
.it{display:grid;grid-template-columns:1fr 2fr;gap:6px 28px;padding:20px 0 20px 20px;border-left:8px solid var(--a);border-bottom:1px solid var(--ln)}.it p{margin:0}h2:before{content:"";display:block;width:56px;height:8px;background:var(--a);margin-bottom:14px}`,
shop:`.hero{background:var(--a);color:var(--ai)}.hero p{color:inherit;opacity:.85}.hero .btn{background:var(--ai);color:var(--a)}.hero .btn.alt{background:none;color:var(--ai);box-shadow:inset 0 0 0 2px var(--ai)}
.items{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px}.it{border:2px solid var(--tx);border-radius:16px;padding:22px;box-shadow:6px 6px 0 var(--b);background:var(--pn)}`
};


// Runs inside the published site. Serialised with toString(), so it must stay self-contained.
function RT(Q){
 const d=document,$=s=>d.querySelector(s),ms=Q.ms||[],ls=Q.ls||[],v=ms.map(m=>m.v),on=ls.map(()=>0),n=ls.map(()=>0),sl=ls.map(()=>0),
 e=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),
 f=x=>Q.cur+Math.round(x).toLocaleString("en-ZA"),g=x=>String(Math.round(x*100)/100),h=x=>x>0?f(x):"Included";
 $("#qc").className=Q.mode==="shop"?"pg":"";$("#qc").innerHTML=ms.map((m,i)=>`<label class="m">${e(m.n)}<b id="mv${i}"></b></label><input type="range" data-m="${i}" min="${m.a}" max="${m.b}" step="${m.s}" value="${m.v}" aria-label="${e(m.n)}">`).join("")+
 ls.map((l,i)=>l.t==="p"&&l.o&&l.o.length?`<div class="r"><span>${e(l.n)}</span><select data-p="${i}" aria-label="${e(l.n)}">${l.o.map((o,j)=>`<option value="${j}">${e(o[0])}${o[1]?" (+"+f(o[1])+")":""}</option>`).join("")}</select></div>`:l.t==="q"&&Q.mode==="shop"?`<div class="pc"><div class="pi" style="${l.i?"background-image:url('"+e(l.i)+"')":""}"></div><b>${e(l.n)}</b><em>${f(l.r)}</em><p>${e(l.d||"")}</p><span class="st"><button data-d="${i}" aria-label="Less">−</button><i id="n${i}">0</i><button data-u="${i}" aria-label="More">+</button></span></div>`:l.t==="q"?`<div class="r"><span>${e(l.n)} <em>${f(l.r)}</em></span><span class="st"><button data-d="${i}" aria-label="Less">−</button><i id="n${i}">0</i><button data-u="${i}" aria-label="More">+</button></span></div>`:l.t==="a"?`<label class="r"><span><input type="checkbox" data-a="${i}"> ${e(l.n)}</span><em>${l.r?f(l.r):""}</em></label>`:"").join("");
 const calc=()=>{const rows=[];let t=Q.base||0;if(t)rows.push(["Starting fee",t]);
  ls.forEach((l,i)=>{let a=0,s=l.n,k=0;
   if(l.t==="p"&&l.o&&l.o.length){const o=l.o[sl[i]]||l.o[0];a=o[1];s=l.n+": "+o[0];k=1}
   else if(l.t==="q"){a=l.r*n[i];s=l.n+" × "+n[i];k=n[i]>0}
   else if(l.t==="a"){a=l.r;k=on[i]}
   else if(l.t==="c"){const q=Math.max(0,(l.m||[]).reduce((p,j)=>p*v[j],1)-(l.fr||0));a=l.r*q;s=l.n+" ("+g(q)+(l.u?" "+l.u:"")+")";k=q>0}
   if(k){rows.push([s,a]);t+=a}});
  if(Q.min&&t>0&&t<Q.min){rows.push(["Minimum charge top-up",Q.min-t]);t=Q.min}
  const vat=t*(Q.vat||0)/100,tot=t+vat;
  ms.forEach((m,i)=>{$("#mv"+i).textContent=g(v[i])+" "+m.u});
  $("#qs").innerHTML=rows.map(r=>`<div class="r"><span>${e(r[0])}</span><b>${h(r[1])}</b></div>`).join("")+(vat?`<div class="r"><span>VAT ${Q.vat}%</span><b>${f(vat)}</b></div>`:"")+`<div class="qt"><span>Estimated total</span><span>${f(tot)}</span></div>`;
  const x=$("#qx").value,msg=rows.map(r=>r[0]+": "+h(r[1])).join("\n")+"\nEstimated total: "+f(tot)+(x?"\nNotes: "+x:""),b=encodeURIComponent(msg);
  $("#qa").href=Q.pay?Q.pay:Q.wa?"https://wa.me/"+Q.wa+"?text="+b:Q.em?"mailto:"+Q.em+"?subject="+encodeURIComponent("Estimate request")+"&body="+b:"#"};
 const q=$("#q");
 q.addEventListener("input",x=>{const t=x.target;if(t.dataset.m!==undefined)v[t.dataset.m]=+t.value;else if(t.dataset.p!==undefined)sl[t.dataset.p]=+t.value;else if(t.dataset.a!==undefined)on[t.dataset.a]=t.checked?1:0;calc()});
 q.addEventListener("click",x=>{const t=x.target,i=t.dataset.d!==undefined?t.dataset.d:t.dataset.u;if(i===undefined)return;n[i]=Math.max(0,Math.min(ls[i].max||99,n[i]+(t.dataset.d!==undefined?-1:1)));$("#n"+i).textContent=n[i];calc()});
 calc()}

const SERIF=/Playfair|Cormorant|Fraunces|Bodoni|Shippori|Serif|Eczar|Amiri|Baskerville|Lora/;
const CR=d=>d.credit?` · ${esc(d.credit)}`:"";
const TRADES=["Construction","Electrical","Retail","Banking","Law","IT","Food","Beauty","Fitness"];
const TGM={con:"Construction",trades:"Electrical",ret:"Retail",bnk:"Banking",law:"Law",it:"IT",ita:"Food",jpn:"Food",indi:"Food",mex:"Food",chn:"Food",mid:"Food",sa:"Food",dnr:"Food",caf:"Food",nls:"Beauty",mup:"Beauty",lsh:"Beauty",hair:"Beauty",brb:"Beauty",spa:"Beauty",fit:"Fitness"};
const EXCL={build:["Construction"],cyber:["Electrical","IT"],shop:["Retail"],ice:["Banking","Law"],menu:["Food"],glam:["Beauty"]};
const FAM={
cyber:{n:"Cyber",p:["Neon|#07080d|#e9edf5|#00e5ff|#ff2bd6|Chakra Petch|Space Grotesk","Amber|#0a0907|#efe8da|#ffb000|#00d4ff|Chakra Petch|Space Grotesk","Terminal|#030806|#d7ffe9|#00ff9c|#ffb000|JetBrains Mono|Space Mono","Violet|#0b0a14|#ece9ff|#8b5cf6|#22d3ee|Syne|Space Grotesk"]},
ice:{n:"Ice",p:["Arctic|#f3f8fd|#0b2239|#1d6fb8|#8ec5f0|Manrope|Manrope","Slate|#f2f4f7|#14202b|#35577a|#a9bdd2|Libre Baskerville|Source Sans 3","Frost|#f1fafa|#0a2a2f|#0f8b8d|#a8dadc|Manrope|Manrope","Midnight|#0a1626|#e6f0fa|#6cb4ee|#b8dcff|Manrope|Manrope"]},
menu:{n:"Menu",p:["Italian|#fbf5ea|#2a1a12|#c0392b|#5b7f3a|Playfair Display|Lora","Japanese|#f7f5f0|#1b1b1b|#b7282e|#b08d57|Shippori Mincho|Zen Kaku Gothic New","Indian|#fff6e6|#3a1c0f|#d9531e|#7a1f5c|Eczar|Hind","Mexican|#fff3e0|#2b1a2e|#e63a6e|#0f9d8f|Rubik|Karla","Chinese|#fff5ee|#2a0f0f|#c8102e|#c99a2e|Noto Serif SC|Noto Sans SC","Middle Eastern|#fbf4e8|#1f2b2a|#0e7c7b|#c18a2c|Amiri|Tajawal","African|#fbefe2|#2a1608|#d35400|#8a2b0f|Oswald|Karla","Diner|#fffaf0|#1c1c1c|#d62828|#1d4e89|Archivo|Karla","Café|#f6efe6|#2d2018|#8b5a2b|#6b8f71|Fraunces|Karla"]},
glam:{n:"Glam",p:["Blush|#fff5f5|#3a1f2b|#d9467a|#f0b8c8|Playfair Display|Jost","Rose gold|#fdf3ee|#3b2a2a|#b76e79|#d4a373|Cormorant Garamond|Jost","Lilac|#f7f3ff|#2c2540|#8b5cf6|#f0abfc|Bodoni Moda|Jost","Noir gold|#14100f|#f5ece4|#d4af37|#e8c4b8|Cormorant Garamond|Jost"]},
build:{n:"Build",p:["Hazard|#eeeeea|#151515|#ffc400|#151515|Barlow Condensed|Barlow","Orange|#efeeec|#1b1b1b|#ff6a13|#2b2b2b|Barlow Condensed|Barlow","Steel|#e9edf1|#101820|#2b6cb0|#101820|Barlow Condensed|Barlow"]},
shop:{n:"Shop",p:["Pop|#ffffff|#151515|#ff2e93|#ffd166|Syne|DM Sans","Fresh|#f7fff7|#12251a|#1a936f|#ffb703|Poppins|Poppins"]},
minimal:{n:"Minimal",p:["Mono|#ffffff|#111111|#111111|#8a8a8a|Inter|Inter","Warm|#faf8f5|#1a1a1a|#8a6d4b|#bfae9a|DM Sans|DM Sans","Cool|#f7f9fa|#14181c|#2f5d8a|#9fb3c4|Manrope|Manrope","Dark|#0c0c0c|#ededed|#ffffff|#777777|Inter|Inter"]},
brutal:{n:"Brutalist",p:["Yellow|#ffde59|#111111|#ff5d8f|#4cc9f0|Space Grotesk|Space Grotesk","Pink|#ffb3e6|#111111|#3a86ff|#ffd60a|Archivo Black|Space Grotesk","Mint|#b8f2d0|#111111|#ff6b6b|#ffd23f|Space Grotesk|Space Grotesk","Paper|#f4f0e8|#111111|#ff3b30|#7cc6fe|Archivo Black|Karla"]},
bento:{n:"Bento",p:["Light|#f2f2f7|#1c1c1e|#0a84ff|#ffd60a|Plus Jakarta Sans|Plus Jakarta Sans","Dark|#0b0b0f|#f5f5f7|#7c5cff|#00d4aa|Plus Jakarta Sans|Plus Jakarta Sans","Warm|#f6efe7|#2b2118|#e8590c|#2f9e44|DM Sans|DM Sans","Mono|#ececec|#111111|#111111|#888888|Outfit|Outfit"]},
editorial:{n:"Editorial",p:["Paper|#faf7f2|#161616|#b3201a|#161616|Playfair Display|Source Sans 3","Ink|#111111|#f2efe9|#e63946|#f2efe9|Playfair Display|Source Sans 3","Sage|#f1f3ec|#1d2a1f|#2d6a4f|#b08968|Fraunces|Source Sans 3"]},
flat:{n:"Flat",p:["Pastel|#fff9f0|#2b2d42|#ef476f|#06d6a0|Poppins|Poppins","Bright|#ffffff|#1b1b3a|#3a86ff|#ffbe0b|Poppins|Poppins","Ocean|#eaf6ff|#0b3954|#087e8b|#ff5a5f|Outfit|Outfit"]}
};
const pal=(f,i)=>{const L=(FAM[f]||FAM.ice).p,v=(L[i]||L[0]).split("|");return{n:v[0],bg:v[1],tx:v[2],a:v[3],b:v[4],hf:v[5],bf:v[6]}};
const FONTL=["Inter","Manrope","DM Sans","Plus Jakarta Sans","Outfit","Poppins","Space Grotesk","Syne","Unbounded","Playfair Display","Fraunces","Cormorant Garamond","Libre Baskerville","Lora","DM Serif Display","Archivo Black","Bebas Neue","Barlow Condensed","Oswald","Caveat","JetBrains Mono","Space Mono"];
const FS={"Libre Baskerville":"wght@400;700","Amiri":"wght@400;700","Space Mono":"wght@400;700","DM Serif Display":"","Archivo Black":"","Bebas Neue":""};
const fnt=n=>{const s=FS[n]===undefined?"wght@400;500;700":FS[n];return"family="+n.replace(/ /g,"+")+(s?":"+s:"")};
const BGT=[["none","Plain"],["anim","Moving gradient"],["aurora","Aurora glow"],["grid","Grid lines"],["dots","Dots"],["image","Image or GIF"],["video","Video loop"]];
const TYPES={
biz:{n:"Business / Corporate",s:["services","stats","calc","about","quotes","team","contact"]},
shop:{n:"E-commerce",s:["calc","pay","services","faq","about","contact"],m:"shop"},
port:{n:"Portfolio",s:["gallery","about","services","quotes","contact"]},
blog:{n:"Blog and media",s:["posts","about","faq","contact"]},
land:{n:"Landing page",s:["services","stats","quotes","faq","cta","contact"]},
npo:{n:"Nonprofit",s:["stats","about","posts","donate","pay","contact"]}
};
const SK={
services:{n:"Services"},calc:{n:"Price calculator or shop"},about:{n:"About"},contact:{n:"Contact"},
gallery:{n:"Gallery",t:"Our work",f:[["i","Image","img"],["c","Caption"]],d:[{c:"Project one"},{c:"Project two"},{c:"Project three"},{c:"Project four"},{c:"Project five"},{c:"Project six"}]},
posts:{n:"Articles",t:"Latest news",f:[["t","Title"],["dt","Date"],["x","Summary","a"],["b","Full text","a"],["i","Image","img"]],d:[{t:"Our first story",dt:"1 March",x:"A short summary of the article goes here.",b:"The full article text goes here."},{t:"What we learned this year",dt:"15 February",x:"Share news, tips or updates with your visitors.",b:"Write the full article here."},{t:"Behind the scenes",dt:"2 February",x:"Show people how you work.",b:"Write the full article here."}]},
stats:{n:"Numbers",t:"",f:[["v","Number"],["l","Label"]],d:[{v:"10+",l:"Years of experience"},{v:"500+",l:"Happy customers"},{v:"24h",l:"Average reply time"}]},
quotes:{n:"Testimonials",t:"What clients say",f:[["q","Quote","a"],["n","Name"]],d:[{q:"Fast, friendly and exactly what we needed.",n:"A happy client"},{q:"They made the whole process easy.",n:"Another client"}],x:[["pid","Google Place ID (starts with ChIJ)"],["key","Google API key (limit it to this website’s domain)"],["proxy","Or your own reviews service address"],["gmax","Reviews to show (1 to 5)"],["gmin","Lowest star rating to show (1 to 5)"]],xd:{pid:"",key:"",proxy:"",gmax:"5",gmin:"4"}},
faq:{n:"FAQ",t:"Questions",f:[["q","Question"],["a","Answer","a"]],d:[{q:"How do I get started?",a:"Send us a message and we will get back to you."},{q:"How long does it take?",a:"It depends on the job. We will give you a clear timeline."},{q:"Can I get a quote first?",a:"Yes. Use the calculator or contact us."}]},
team:{n:"Team",t:"The team",f:[["n","Name"],["r","Role"],["i","Photo","img"]],d:[{n:"Name Surname",r:"Founder"},{n:"Name Surname",r:"Manager"},{n:"Name Surname",r:"Specialist"}]},
donate:{n:"Donations",t:"Support our cause",x:[["goal","Goal"],["raised","Raised so far"],["amts","Suggested amounts, separated by commas"],["link","Payment page link"],["bank","Bank details or reference"]],xd:{goal:"50000",raised:"18000",amts:"100,250,500,1000",link:"",bank:""}},
pay:{n:"Payment links",t:"Pay online",f:[["t","Name"],["a","Amount or description"],["u","Payment link"],["b","Button label"]],x:[["eft","Bank transfer (EFT) details, one per line"],["note","Note shown under the payments"]],d:[{t:"Pay a deposit",a:"Secure payment on your provider’s page",u:"",b:"Pay now"}],xd:{eft:"Bank: \nAccount name: \nAccount number: \nBranch code: \nReference: your name",note:"Payments are processed on your payment provider’s secure page. We never see your card details."}},
cta:{n:"Call to action",t:"",x:[["h","Headline"],["b","Button label"],["l","Button link"]],xd:{h:"Ready to get started?",b:"Contact us",l:"#contact"}}
};
const defSec=ty=>{const on=TYPES[ty].s,all=Object.keys(SK);return[...on,...all.filter(k=>!on.includes(k))].map(k=>({k,on:on.includes(k)?1:0,t:SK[k].t||"",i:(SK[k].d||[]).map(x=>({...x})),x:{...(SK[k].xd||{})}}))};
const LOOK={con:["build",0],trades:["cyber",1],ret:["shop",0,"shop"],bnk:["ice",0],law:["ice",1],it:["cyber",2],ita:["menu",0],jpn:["menu",1],indi:["menu",2],mex:["menu",3],chn:["menu",4],mid:["menu",5],sa:["menu",6],dnr:["menu",7],caf:["menu",8],nls:["glam",0],mup:["glam",1],lsh:["glam",1],hair:["glam",2],brb:["glam",3],spa:["minimal",1],fit:["cyber",0]};
// Style library: name|family|palette|headings font|body font|hero background|page colour|accent|inspired by (studio reference)
const SL=`Data map|cyber|2|||grid||#00ff9c|UNITED24
Friendly hand-drawn|flat|0|Caveat|Poppins|none|||HeyFriends!
Deep blue type|brutal|0|Archivo Black|Space Grotesk|none|#0b2a6f|#ffd23f|Abetka UA
Handmade product|shop|1|Archivo Black|DM Sans|none|#fff7e0|#f2a900|B-Egg Farm
Dark serif writer|editorial|1|||none|||Ellipsus
Cinematic type|cyber|3|||aurora|||Mona Sans
Product minimal|minimal|0|||none|||Apple Siri
Retro terminal|cyber|2|Space Mono|Space Mono|grid|#000000|#ffd400|Overrrides
Deep green serif|editorial|2|||none|#0f3d2e|#c8f169|Mode
Soft studio|bento|3|||none|||Lusion
Sepia story|editorial|0|Fraunces||none|#efe3cf|#8a5a2b|The Message to Ukraine
Maximal punk|brutal|1|||none|||DIKO
Earthy data|editorial|0|||none|#2b1a12|#ff7a1a|Ventriloc
Bubblegum glam|glam|0|||anim|#ffc2e2|#e0218a|You Can Be Anything
Grid lesson|brutal|0|||grid|||GRIDS
Modular tiles|bento|0|||none||#1d4ed8|Depo Studio
Loud orange|brutal|3|Archivo Black||none|#ff6a13|#111111|Rebellion
Generative mesh|cyber|1|||aurora|||Fabric
Playful print|flat|0|Poppins||none|#ff8a3d|#111111|Hydra
Colour collage|flat|0|||anim|||StoryMakers Project
Glow dark tech|cyber|3|||aurora|||Auxility
Magazine mono|editorial|0|||none||#ff6a13|SEBTO
Cinematic video|minimal|1|||video|||Pebble Life
Arcade neon|cyber|0|Space Mono||grid|||Can’t Unsee
Luxe cream serif|editorial|0|Cormorant Garamond||none|#f4efe6|#2f4f3a|MORAL
Official flag|flat|1|||none|#0057b8|#ffd700|прапор.укр
Calm medical dark|cyber|3|||aurora||#34d399|Fluent
Glass dark|bento|1|||none|||Umbrel
Pink and blue doodle|flat|0|||none|#ffd6e8|#2f5bff|Dumy
Fog monochrome|minimal|2|||aurora|||Enpower Trading
Oversized green|flat|1|Unbounded||none|#0f5132|#ff6b6b|Flayks
Primary cards|flat|1|||none|||The Web Can Do What!?
Punchy illustration|flat|0|||none|#ffd23f|#e63946|Crew by Tubik Studio
Big black and white|minimal|0|||none||#ffc400|SaveDay
Sporty collage|brutal|3|||none||#ff5a00|Adidas Arena
Neon gradient dark|cyber|0|||aurora|||Metadrop
Techy minimal dark|minimal|3|Space Mono||none|||Teenage Engineering
Electric blue|bento|0|||none|#1f3bff|#ffffff|Art+Tech Report
Premium dark UI|bento|1|||none|||Endless Tools
Cyan caps dark|cyber|0|||grid||#22d3ee|Ethnocare
Pink glow dark|cyber|3|||aurora||#f02e65|Appwrite
Beige interiors|minimal|1|||none|||Artbruno
Bold yellow and purple|brutal|0|||none||#7c3aed|Flying Papers
Instrument panel|cyber|2|||grid|||Arrow Dynamics
Icy industrial|cyber|0|JetBrains Mono||grid||#7dd3fc|Pinnacle Design Lab
Red black white|brutal|3|||none||#e10600|Kovalska
Mono with pink|minimal|3|||none||#ff4d9d|Tiny Wins
Cream editorial|editorial|0|||none|#f4ecdc||Gemnote
Cinematic bookshop|editorial|1|||none|||Stripe Press
Vivid purple|bento|1|||anim||#7c3aed|Pitch`.split("\n").map(l=>{const v=l.split("|"),p=pal(v[1],+v[2]);return{n:v[0],fam:v[1],pal:+v[2],hf:v[3],bf:v[4],bg:v[5]||"none",pbg:v[6],color:v[7],ref:v[8],sw:[v[6]||p.bg,v[7]||p.a,p.b]}});

const QCSS=`#quote .q{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;background:var(--pn,var(--bg));border:1px solid var(--ln);border-radius:var(--rd2,14px);padding:clamp(16px,3vw,30px)}#quote .q.shop{grid-template-columns:1.7fr 1fr}
#quote label.m{display:flex;justify-content:space-between;font-weight:600;margin-top:18px}#quote label.m:first-child{margin-top:0}#quote input[type=range]{width:100%;accent-color:var(--a)}
#quote .r{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--ln)}#quote .r em{color:var(--mu);font-size:13px;font-style:normal}
#quote .st{display:inline-flex;align-items:center;gap:10px}#quote .st button{width:32px;height:32px;border-radius:50%;border:1px solid var(--ln);background:var(--bg);color:var(--tx);font-size:18px;cursor:pointer}
#quote select,#quote textarea{font:inherit;color:var(--tx);background:var(--bg);border:1px solid var(--ln);border-radius:8px;padding:8px;max-width:58%}#quote textarea{width:100%;max-width:none;min-height:60px;margin-top:10px}
#quote .qt{display:flex;justify-content:space-between;font:var(--hw,700) 24px var(--hf);padding:14px 0 4px;border-top:2px solid var(--tx);margin-top:6px}#quote .qn{font-size:13px;color:var(--mu)}
#quote .pg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}#quote .pc{border:1px solid var(--ln);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px}#quote .pi{aspect-ratio:1;border-radius:8px;background:linear-gradient(135deg,var(--a),var(--b));opacity:.35;background-size:cover;background-position:center}#quote .pi[style*=url]{opacity:1}#quote .pc p{margin:0;font-size:13px;color:var(--mu)}
@media(max-width:760px){#quote .q,#quote .q.shop{grid-template-columns:1fr}}`;
const CSSB=`*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--tx);font:17px/1.65 var(--bf)}h1,h2,h3{font-family:var(--hf);font-weight:var(--hw,700);line-height:1.12;margin:0}a{color:inherit}.w{max-width:1040px;margin:0 auto;padding-left:22px;padding-right:22px}.mu{color:var(--mu)}
.nav{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:18px;padding-bottom:18px}.nav b{font:var(--hw,700) 21px var(--hf)}.nav a{font-weight:600}
.hero{position:relative;overflow:hidden;padding:72px 0 64px}.hero>.w{position:relative;z-index:2}.hero h1{font-size:clamp(34px,6.4vw,62px);max-width:15em}.hero p{font-size:20px;color:var(--mu);max-width:32em;margin:18px 0 28px}
.btn{display:inline-block;margin:0 10px 10px 0;padding:14px 26px;font:700 16px var(--bf);background:var(--a);color:var(--ai);text-decoration:none;border-radius:var(--rd);border:0;cursor:pointer}.btn.alt{background:none;color:var(--tx);box-shadow:inset 0 0 0 2px var(--a)}
section{padding:60px 0}h2{font-size:clamp(26px,4vw,38px);margin-bottom:26px}.it p{margin:6px 0 0;color:var(--mu)}.it h3{font-size:21px}
.about{font-size:21px;max-width:36em;margin:0}ul.inf{list-style:none;margin:0 0 24px;padding:0}.inf li{display:flex;gap:20px;padding:12px 0;border-top:1px solid var(--ln)}.inf b{min-width:72px}
footer{padding:28px 0;color:var(--mu);font-size:14px;border-top:1px solid var(--ln)}@media(max-width:640px){.it{grid-template-columns:1fr!important}}`;
const SCSS=`.bgm{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background-size:cover;background-position:center;z-index:0}.hb:before{content:"";position:absolute;inset:0;background:rgba(0,0,0,var(--ov,.45));z-index:1}.hb,.hb h1,.hb p{color:#fff}.hb .btn.alt{color:#fff;box-shadow:inset 0 0 0 2px #fff}
.hero.bg-anim{background:linear-gradient(120deg,var(--a),var(--b),var(--a));background-size:300% 300%;animation:mv 14s ease infinite}.hero.bg-aurora{background:radial-gradient(40% 60% at 20% 30%,color-mix(in srgb,var(--a) 65%,transparent),transparent),radial-gradient(40% 60% at 80% 70%,color-mix(in srgb,var(--b) 65%,transparent),transparent),var(--bg);background-size:150% 150%;animation:mv 18s ease-in-out infinite alternate}
.hero.bg-grid{background-image:linear-gradient(color-mix(in srgb,var(--tx) 9%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--tx) 9%,transparent) 1px,transparent 1px);background-size:44px 44px}.hero.bg-dots{background-image:radial-gradient(color-mix(in srgb,var(--tx) 18%,transparent) 1.5px,transparent 1.6px);background-size:22px 22px}
@keyframes mv{0%{background-position:0 50%}50%{background-position:100% 50%}100%{background-position:0 50%}}@media(prefers-reduced-motion:reduce){.hero{animation:none!important}}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.gal figure{margin:0;aspect-ratio:4/3;border-radius:var(--rd2,12px);background-size:cover;background-position:center;position:relative;overflow:hidden}.gal figcaption{position:absolute;left:0;right:0;bottom:0;padding:10px 12px;background:linear-gradient(transparent,rgba(0,0,0,.65));color:#fff;font-size:14px}
.po{display:grid;grid-template-columns:200px 1fr;gap:20px;padding:20px 0;border-top:1px solid var(--ln)}.po .pi{aspect-ratio:4/3;border-radius:var(--rd2,12px);background-size:cover;background-position:center}.po small{color:var(--mu)}.po h3{margin:4px 0}.po p{margin:6px 0 0}details.f{border-top:1px solid var(--ln);padding:12px 0}details.f summary{cursor:pointer;font-weight:600}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:18px}.stats b{display:block;font:var(--hw,700) clamp(32px,6vw,54px) var(--hf);color:var(--a)}.stats span{color:var(--mu)}
.qs{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}blockquote{margin:0;padding:22px;border:1px solid var(--ln);border-radius:var(--rd2,12px);background:var(--pn);font-size:19px}blockquote cite{display:block;margin-top:12px;font-size:14px;font-style:normal;color:var(--mu)}
.team{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:18px;text-align:center}.team i{display:block;aspect-ratio:1;border-radius:50%;margin-bottom:10px;background:linear-gradient(135deg,var(--a),var(--b));background-size:cover;background-position:center}
.don{max-width:560px}.bar2{height:12px;border-radius:12px;background:var(--ln);overflow:hidden}.bar2 i{display:block;height:100%;background:var(--a)}.don .chips{margin:14px 0}
.ctab{text-align:center;background:var(--a);color:var(--ai)}.ctab h2{margin-bottom:18px}.ctab .btn{background:var(--ai);color:var(--a);box-shadow:none}
@media(max-width:640px){.po{grid-template-columns:1fr}}`;
Object.assign(CSSF,{
cyber:`body:after{content:"";position:fixed;inset:0;pointer-events:none;z-index:5;background:repeating-linear-gradient(0deg,hsl(0 0% 100%/.025) 0 1px,transparent 1px 4px)}.hero h1{text-transform:uppercase;text-shadow:1px 0 var(--b),-1px 0 var(--a)}.btn{clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))}.btn.alt{background:color-mix(in srgb,var(--b) 16%,transparent);color:var(--b);box-shadow:none}
.hero{background:radial-gradient(60% 90% at 88% 0,color-mix(in srgb,var(--a) 22%,transparent),transparent 70%),radial-gradient(50% 80% at 0 100%,color-mix(in srgb,var(--b) 16%,transparent),transparent 70%)}
.items{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px}.it{position:relative;padding:24px;border:1px solid var(--ln);background:var(--pn)}.it:before,.it:after{content:"";position:absolute;width:14px;height:14px}.it:before{top:-1px;left:-1px;border-top:2px solid var(--a);border-left:2px solid var(--a)}.it:after{right:-1px;bottom:-1px;border-bottom:2px solid var(--b);border-right:2px solid var(--b)}
h2:after{content:"";display:block;width:64px;height:3px;margin-top:14px;background:linear-gradient(90deg,var(--a),var(--b));box-shadow:0 0 14px var(--a)}.nav b:before{content:"";display:inline-block;width:9px;height:9px;margin-right:10px;background:var(--a);box-shadow:0 0 12px var(--a)}`,
minimal:`.hero{padding:150px 0 110px}.hero h1{letter-spacing:-.03em;font-size:clamp(38px,7vw,76px)}section{padding:90px 0}h2{font-size:clamp(22px,3vw,30px)}.btn{background:none;color:var(--tx);box-shadow:inset 0 0 0 1px var(--tx);font-weight:500}.btn:hover{background:var(--tx);color:var(--bg)}.btn.alt{box-shadow:none;text-decoration:underline;text-underline-offset:5px}
.items{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:48px 40px}.it{border-top:1px solid var(--ln);padding-top:18px}.stats b{color:var(--tx)}`,
brutal:`h1,h2,h3{text-transform:uppercase}.top,.hero,section{border-bottom:4px solid var(--tx)}.btn{border:3px solid var(--tx);box-shadow:5px 5px 0 var(--tx);color:var(--tx);background:var(--a);transition:transform .1s}.btn:hover{transform:translate(3px,3px);box-shadow:2px 2px 0 var(--tx)}.btn.alt{background:var(--b)}
.items{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:22px}.it{border:3px solid var(--tx);box-shadow:8px 8px 0 var(--tx);padding:22px;background:var(--pn);color:#111}.it p{color:#222}.it:nth-child(3n+1){background:var(--b)}.it:nth-child(3n+2){background:var(--a)}h2{display:inline-block;background:var(--tx);color:var(--bg);padding:4px 14px}.ctab{color:#111}`,
bento:`:root{--rd2:28px}.hero{padding:56px 0 40px}.hero>.w>div{background:var(--pn);border:1px solid var(--ln);border-radius:36px;padding:56px 40px}.items{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:minmax(150px,auto);gap:14px}.it{background:var(--pn);border:1px solid var(--ln);border-radius:28px;padding:26px}.it:nth-child(1){grid-column:span 2;grid-row:span 2;background:var(--a);color:var(--ai)}.it:nth-child(1) p{color:inherit;opacity:.85}.it:nth-child(4){grid-column:span 2}.it:nth-child(5){background:var(--b);color:#111}.it:nth-child(5) p{color:#222}
.stats>div{background:var(--pn);border:1px solid var(--ln);border-radius:28px;padding:22px}h2{font-size:clamp(22px,3vw,30px)}@media(max-width:760px){.items{grid-template-columns:1fr 1fr}.it:nth-child(1){grid-column:span 2}}`,
editorial:`.top{border-bottom:3px double var(--tx)}.hero{padding:70px 0 50px;border-bottom:1px solid var(--tx)}.hero h1{font-size:clamp(46px,9vw,110px);line-height:.98;letter-spacing:-.02em;max-width:12em}.hero p{font:italic 22px/1.5 var(--hf);max-width:30em}.btn{border-radius:0;background:var(--tx);color:var(--bg)}.btn.alt{background:none;color:var(--tx);box-shadow:inset 0 0 0 1px var(--tx)}
.items{columns:2;column-gap:48px;column-rule:1px solid var(--ln)}.it{break-inside:avoid;padding:0 0 22px}.it h3{font-size:26px}.about{columns:2;column-gap:40px;font-size:18px;max-width:none}.about:first-letter{float:left;font:700 76px/.85 var(--hf);padding:6px 10px 0 0;color:var(--a)}h2{border-top:4px solid var(--tx);padding-top:10px;font-size:clamp(28px,4vw,44px)}.stats b{color:var(--tx)}@media(max-width:700px){.items,.about{columns:1}}`,
flat:`.hero{background:color-mix(in srgb,var(--a) 14%,var(--bg))}.btn{border-radius:12px}.items{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.it{padding:26px;border-radius:16px;background:color-mix(in srgb,var(--a) 16%,var(--bg))}.it:nth-child(2n){background:color-mix(in srgb,var(--b) 24%,var(--bg))}.it:nth-child(3n){background:color-mix(in srgb,var(--tx) 7%,var(--bg))}h2:before{content:"";display:inline-block;width:18px;height:18px;border-radius:50%;background:var(--b);margin-right:12px;vertical-align:-2px}`
});

const est=d=>{const q=d.q;if(!q||!(q.ms.length||q.ls.length))return"";
 const Q={...q,wa:(d.wa||d.phone||"").replace(/\D/g,"").replace(/^0/,"27"),em:d.email||""};
 return `<section id="quote"><div class="w"><h2>${esc(q.t||"Get an estimate")}</h2><div class="q${q.mode==="shop"?" shop":""}" id="q"><div id="qc"></div><div><div id="qs"></div><textarea id="qx" placeholder="Anything else we should know?" aria-label="Notes"></textarea><p><a class="btn" id="qa" href="#">${q.mode==="shop"?"Checkout":"Send this estimate"}</a></p><p class="qn">${esc(q.note||"")}</p></div></div></div></section><script>(${RT.toString()})(${JSON.stringify(Q).replace(/</g,"\\u003c")})<\/script>`};
// ===== decor =====
const MOT={
flower:()=>{let s="";for(let i=0;i<6;i++)s+=`<ellipse cx="50" cy="26" rx="13" ry="24" transform="rotate(${i*60} 50 50)"/>`;return s+`<circle cx="50" cy="50" r="10" fill="#fff" fill-opacity=".8"/>`},
sparkle:()=>`<path d="M50 2Q56 44 98 50Q56 56 50 98Q44 56 2 50Q44 44 50 2Z"/>`,
heart:()=>`<path d="M50 90C8 60 4 30 26 18c13-6 24 0 24 14 0-14 11-20 24-14 22 12 18 42-24 72Z"/>`,
leaf:()=>`<path d="M50 96C8 70 8 28 50 4c42 24 42 66 0 92Z"/><path d="M50 90V22" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none"/>`,
drop:()=>`<path d="M50 4C80 40 86 58 50 96 14 58 20 40 50 4Z"/>`,
steam:()=>`<path d="M28 92Q12 72 28 56T28 20M54 92Q38 72 54 56T54 20M80 92Q64 72 80 56T80 20" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`,
gear:()=>{let p="";for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?36:47;p+=(i?"L":"M")+(50+r*Math.cos(a)).toFixed(1)+" "+(50+r*Math.sin(a)).toFixed(1)}return`<path d="${p}ZM50 36a14 14 0 1 0 .1 0Z" fill-rule="evenodd"/>`},
brick:()=>`<g fill="none" stroke="currentColor" stroke-width="5"><rect x="4" y="10" width="44" height="22"/><rect x="52" y="10" width="44" height="22"/><rect x="28" y="36" width="44" height="22"/><rect x="4" y="62" width="44" height="22"/><rect x="52" y="62" width="44" height="22"/></g>`,
hex:()=>`<path d="M50 5L90 27V73L50 95L10 73V27Z" fill="none" stroke="currentColor" stroke-width="7"/>`,
bolt:()=>`<path d="M58 2L18 56H44L36 98L82 40H56Z"/>`,
circuit:()=>`<path d="M8 50H38L54 30H88M38 50L54 70H88M54 30V8" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="88" cy="30" r="7"/><circle cx="88" cy="70" r="7"/><circle cx="54" cy="8" r="7"/>`,
brackets:()=>`<path d="M32 12L8 50L32 88M68 12L92 50L68 88" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
tag:()=>`<path d="M6 50L50 6H94V50L50 94Z"/><circle cx="70" cy="30" r="7" fill="#fff" fill-opacity=".85"/>`,
coin:()=>`<circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="7"/><path d="M50 24V76M38 38H58Q66 38 66 46T58 54H42Q34 54 34 62T42 70H64" fill="none" stroke="currentColor" stroke-width="6"/>`,
columns:()=>`<rect x="14" y="8" width="72" height="9"/><rect x="24" y="21" width="12" height="58"/><rect x="44" y="21" width="12" height="58"/><rect x="64" y="21" width="12" height="58"/><rect x="10" y="83" width="80" height="10"/>`,
star:()=>`<path d="M50 4L62 36L96 38L70 59L79 92L50 73L21 92L30 59L4 38L38 36Z"/>`,
wave:()=>`<path d="M0 50Q12 18 25 50T50 50T75 50T100 50" fill="none" stroke="currentColor" stroke-width="7"/>`,
dots:()=>`<circle cx="22" cy="22" r="8"/><circle cx="64" cy="30" r="6"/><circle cx="36" cy="66" r="9"/><circle cx="80" cy="76" r="7"/>`
};
const MT={flower:["Beauty"],sparkle:["Beauty"],heart:["Beauty"],leaf:["Beauty","Food"],drop:["Beauty","Electrical"],steam:["Food"],gear:["Construction","Electrical"],brick:["Construction"],hex:["Construction","IT","Banking"],bolt:["Electrical","Fitness"],circuit:["Electrical","IT"],brackets:["IT"],tag:["Retail"],coin:["Banking","Retail"],columns:["Law","Banking"],star:[],wave:[],dots:[]};
const MN={flower:"Flowers",sparkle:"Sparkles",heart:"Hearts",leaf:"Leaves",drop:"Droplets",steam:"Steam",gear:"Gears",brick:"Bricks",hex:"Hexagons",bolt:"Bolts",circuit:"Circuits",brackets:"Code brackets",tag:"Price tags",coin:"Coins",columns:"Columns",star:"Stars",wave:"Waves",dots:"Dots"};
const DEC={con:["gear","corners"],trades:["bolt","scatter"],ret:["tag","scatter"],bnk:["hex","corners"],law:["columns","corners"],it:["brackets","scatter"],ita:["leaf","scatter"],jpn:["wave","divider"],indi:["flower","pattern"],mex:["star","scatter"],chn:["wave","divider"],mid:["star","pattern"],sa:["dots","pattern"],dnr:["star","scatter"],caf:["steam","corners"],nls:["sparkle","scatter"],mup:["flower","scatter"],lsh:["sparkle","corners"],hair:["flower","corners"],brb:["star","divider"],spa:["leaf","float"],fit:["bolt","scatter"]};
const PLC=[["none","None"],["scatter","Scattered"],["float","Floating"],["corners","Corners"],["pattern","Repeating pattern"],["divider","Under headings"]];
const motifOK=(c,m)=>!(MT[m]||[]).length||c.all||MT[m].some(t=>c.trades.includes(t));
const mot=(m,s,col,rot,op,st)=>`<svg viewBox="0 0 100 100" width="${Math.round(s)}" height="${Math.round(s)}" fill="${col}" color="${col}" style="${st}transform:rotate(${rot}deg);opacity:${op}" aria-hidden="true">${MOT[m]()}</svg>`;
const decor=(d,a,b)=>{const c=d.dc||{},m=c.m,pl=c.p||"none";if(!MOT[m]||pl==="none")return["",""];const s=+c.s||56,op=(c.o===undefined?28:+c.o)/100,col=c.c||a;
 if(pl==="corners")return[`<div class="dec">${mot(m,s*3,col,-12,op,`position:absolute;right:${-Math.round(s/2)}px;top:${-Math.round(s/2)}px;`)}${mot(m,s*2,b,18,op,`position:absolute;left:${-Math.round(s/3)}px;bottom:${-Math.round(s/3)}px;`)}</div>`,""];
 if(pl==="scatter"||pl==="float"){let h="";for(let i=0;i<9;i++){const x=(i*37+11)%90,y=(i*53+7)%80,z=s*(.5+((i*29)%10)/10),r=(i*47)%60-30;h+=mot(m,z,i%2?col:b,r,op,`position:absolute;left:${x}%;top:${y}%;`+(pl==="float"?`animation:fl ${6+i%5}s ease-in-out ${-i}s infinite alternate;`:""))}return[`<div class="dec">${h}</div>`,pl==="float"?"@keyframes fl{from{translate:0 0}to{translate:0 -18px}}@media(prefers-reduced-motion:reduce){.dec svg{animation:none!important}}":""]}
 const t=Math.max(18,Math.round(s/2)),tile="data:image/svg+xml,"+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${s}" height="${s}" fill="${col}" color="${col}" opacity="${op}">${MOT[m]()}</svg>`);
 if(pl==="pattern")return[`<div class="dcp" style="background-image:url('${tile}');background-size:${Math.round(s*1.8)}px"></div>`,""];
 return["",`h2:after{content:"";display:block;width:${s*3}px;height:${t}px;margin:12px ${["menu","glam"].includes(d.fam)?"auto":"0"} 0;background:url('${tile}') 0 50%/${t}px repeat-x;box-shadow:none}`]};

// ===== Google reviews: runs inside the published site, so it must stay self-contained =====
function GR(C){
 const b=document.querySelector("#gr"),e=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),st=n=>"★".repeat(Math.round(n))+"☆".repeat(5-Math.round(n)),q=encodeURIComponent(C.pid),
 lk=`<p class="gl"><a class="btn alt" href="https://search.google.com/local/writereview?placeid=${q}" target="_blank" rel="noopener">Write a Google review</a><a class="btn alt" href="https://www.google.com/maps/place/?q=place_id:${q}" target="_blank" rel="noopener">See all reviews</a></p>`;
 b.innerHTML=lk;
 const u=C.proxy?C.proxy+(C.proxy.indexOf("?")>-1?"&":"?")+"pid="+q:C.key?"https://places.googleapis.com/v1/places/"+q:"";
 if(!u)return;
 fetch(u,C.proxy?{}:{headers:{"X-Goog-Api-Key":C.key,"X-Goog-FieldMask":"rating,userRatingCount,reviews,googleMapsUri"}}).then(r=>r.json()).then(j=>{
  const R=(j.reviews||[]).filter(r=>r.rating>=C.min).slice(0,C.max);if(!R.length)return;
  b.innerHTML=`<h3 class="gh">${j.rating?st(j.rating)+" "+j.rating+" on Google"+(j.userRatingCount?" ("+j.userRatingCount+" reviews)":""):"Google reviews"}</h3><div class="qs">${R.map(r=>{const a=r.authorAttribution||{},t=(r.text&&r.text.text)||(r.originalText&&r.originalText.text)||"";return`<blockquote>${e(t.slice(0,260))}<cite>${st(r.rating)} <a href="${e(a.uri||"#")}" target="_blank" rel="noopener">${e(a.displayName||"Google user")}</a> · ${e(r.relativePublishTimeDescription||"")}</cite></blockquote>`}).join("")}</div><p class="qn">Reviews from Google, shown by relevance.</p>`+lk}).catch(()=>{})}

// ===== layout, section and button styles =====
const SCSS2=`.h-center{text-align:center}.h-center h1,.h-center p{margin-left:auto;margin-right:auto}.sp2{display:grid;grid-template-columns:1.2fr 1fr;gap:32px;align-items:center}.hi{min-height:280px;border-radius:var(--rd2,16px);background-size:cover;background-position:center}
.bh{display:flex;flex-wrap:wrap;gap:10px}.bh .btn,.ba .btn,.nb .btn{margin:0}.ba{display:flex;flex-wrap:wrap;gap:10px;margin-top:-30px;margin-bottom:30px}.nb{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}
.fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:30;display:flex;flex-direction:column;gap:8px}.fab .btn{margin:0;box-shadow:0 8px 24px rgba(0,0,0,.25)}.bbar{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));background:var(--bg);border-top:1px solid var(--ln)}.bbar .btn{margin:0;flex:1;text-align:center}
.pgbg{position:fixed;inset:0;z-index:-2;background-size:cover;background-position:center}.pgov{position:fixed;inset:0;z-index:-1;background:var(--bg)}.dec{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1}.dcp{position:fixed;inset:0;z-index:-1;pointer-events:none}
.sb{position:relative}.sb:before{content:"";position:absolute;inset:0;background:rgba(0,0,0,var(--sov,.45))}.sb>.w{position:relative}.dk,.sb{background-size:cover;background-position:center}
.dk{--tx:#fff;--mu:rgba(255,255,255,.78);--ln:rgba(255,255,255,.28);--pn:rgba(255,255,255,.1);color:#fff}.lt{--tx:#161616;--mu:#555;--ln:rgba(0,0,0,.16);--pn:#fff;color:#161616}
.al-c .w{text-align:center}.al-c h2:after,.al-c h2:before{margin-left:auto;margin-right:auto}
.ly-grid .items{display:grid!important;columns:auto!important;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))!important;gap:18px!important}.ly-grid .it{display:block!important;border:1px solid var(--ln)!important;border-radius:var(--rd2,12px)!important;padding:22px!important;box-shadow:none!important;background:var(--pn)!important}
.ly-list .items{display:block!important;columns:auto!important}.ly-list .it{display:grid!important;grid-template-columns:1fr 2fr!important;gap:6px 28px!important;padding:16px 0!important;border:0!important;border-top:1px solid var(--ln)!important;box-shadow:none!important;background:none!important;border-radius:0!important}
.ly-cols .items{display:block!important;columns:2!important;column-gap:40px!important}.ly-cols .it{display:block!important;break-inside:avoid;margin-bottom:18px;padding:0!important;border:0!important;box-shadow:none!important;background:none!important}
.ly-bento .items{display:grid!important;columns:auto!important;grid-template-columns:repeat(4,1fr)!important;gap:14px!important}.ly-bento .it{display:block!important;background:var(--pn)!important;border:1px solid var(--ln)!important;border-radius:24px!important;padding:24px!important;box-shadow:none!important}.ly-bento .it:nth-child(1){grid-column:span 2;grid-row:span 2}.ly-bento .it:nth-child(4){grid-column:span 2}
.ly-masonry .gal{display:block;columns:3 200px;column-gap:14px}.ly-masonry .gal figure{break-inside:avoid;margin-bottom:14px;aspect-ratio:auto;min-height:170px}.ly-masonry .gal figure:nth-child(3n+1){min-height:260px}.ly-masonry .gal figure:nth-child(3n+2){min-height:200px}
.pays{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.pay{padding:22px;border:1px solid var(--ln);border-radius:var(--rd2,12px);background:var(--pn)}.pay h3{margin-bottom:6px}.pay p{margin:0 0 14px;color:var(--mu)}.pay .btn{margin:0}.mt{margin:26px 0 10px}.eft{white-space:pre-wrap;font:15px/1.6 ui-monospace,Menlo,monospace;padding:16px;border:1px dashed var(--ln);border-radius:10px;margin:0}
.gh{font-size:22px;margin:30px 0 14px}.gl{margin:14px 0}.gl .btn{margin:0 8px 8px 0}.qn{font-size:13px;color:var(--mu)}
@media(max-width:760px){.sp2{grid-template-columns:1fr}.ly-bento .items{grid-template-columns:1fr 1fr!important}.ly-cols .items{columns:1!important}.ly-list .it{grid-template-columns:1fr!important}}`;
const BSHAPE={sq:"0",soft:"10px",pill:"999px"};
const autoBl=d=>{const t=(d.phone||"").replace(/[^\d+]/g,""),w=(d.wa||d.phone||"").replace(/\D/g,""),o=[];["hero","contact"].forEach(at=>{if(t)o.push({l:"Call "+d.phone,t:"call",s:"p",at});if(w)o.push({l:"WhatsApp us",t:"wa",s:"a",at});if(d.email)o.push({l:"Email us",t:"mail",s:"a",at})});return o};
const bhref=(b,d)=>{const w=(d.wa||d.phone||"").replace(/\D/g,"").replace(/^0/,"27"),t=(d.phone||"").replace(/[^\d+]/g,"");return b.t==="call"?"tel:"+t:b.t==="wa"?"https://wa.me/"+w:b.t==="mail"?"mailto:"+(d.email||""):(b.u||"#")};
const bh=(b,d)=>{const h=bhref(b,d);return`<a class="btn${b.s==="a"?" alt":""}" href="${esc(h)}"${/^https?:/.test(h)&&b.t!=="wa"?' target="_blank" rel="noopener"':""}>${esc(b.l||"Button")}</a>`};
const ovrCss=d=>{const L=d.lay||{},B=d.btn||{};let c="";
 if(L.wid)c+=`.w{max-width:${{narrow:820,wide:1240}[L.wid]||1040}px}`;
 if(L.sp)c+=`section{padding:${{tight:34,airy:100}[L.sp]||60}px 0!important}`;
 if(L.rad){const r={sq:"0",soft:"12px",round:"28px"}[L.rad];c+=`:root{--rd2:${r}!important}.it,.q,blockquote,.gal figure,.po .pi,.pay,.pc,.hi,#quote .q,.hero>.w>div{border-radius:${r}!important}`}
 if(B.shape)c+=`.btn{border-radius:${BSHAPE[B.shape]||"0"}!important;clip-path:${B.shape==="chamfer"?"polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))":"none"}!important}`;
 if(B.fill==="solid")c+=`.btn{background:var(--a)!important;color:var(--ai)!important;box-shadow:none!important;border:0!important}.btn.alt{background:none!important;color:var(--tx)!important;box-shadow:inset 0 0 0 2px var(--a)!important}`;
 if(B.fill==="outline")c+=`.btn,.btn.alt{background:none!important;color:var(--a)!important;box-shadow:inset 0 0 0 2px var(--a)!important;border:0!important}`;
 if(B.fill==="soft")c+=`.btn,.btn.alt{background:color-mix(in srgb,var(--a) 16%,transparent)!important;color:var(--a)!important;box-shadow:none!important;border:0!important}`;
 if(B.fill==="hard")c+=`.btn,.btn.alt{background:var(--a)!important;color:var(--ai)!important;border:3px solid var(--tx)!important;box-shadow:5px 5px 0 var(--tx)!important}.btn.alt{background:var(--b)!important;color:#111!important}`;
 if(B.fill==="link")c+=`.btn,.btn.alt{background:none!important;color:var(--tx)!important;box-shadow:none!important;border:0!important;text-decoration:underline;text-underline-offset:5px;padding-left:4px!important;padding-right:4px!important}`;
 if(B.size==="s")c+=`.btn{padding:9px 16px!important;font-size:14px!important}`;
 if(B.size==="l")c+=`.btn{padding:18px 36px!important;font-size:19px!important}`;
 if(B.caps)c+=`.btn{text-transform:uppercase;letter-spacing:.07em}`;
 if(B.hov==="lift")c+=`.btn{transition:transform .15s}.btn:hover{transform:translateY(-3px)!important}`;
 if(B.hov==="fill")c+=`.btn{transition:background .15s,color .15s}.btn:hover{background:var(--tx)!important;color:var(--bg)!important}`;
 return c};

// ===== sections =====
const secH=(s,d,c)=>{const K=s.k,x=s.x||{},it=s.i||[],
 bg=(()=>{const st=[];if(s.bc)st.push(`background-color:${esc(s.bc)}`);if(s.bv)st.push(`background-image:url('${esc(s.bv)}')`);st.push(`--sov:${(s.bo===undefined?45:s.bo)/100}`);const dk=s.bv||(s.bc&&ink(s.bc)==="#fff"),li=!s.bv&&s.bc&&ink(s.bc)==="#111";return{c:((s.al==="c"?" al-c":"")+(s.ly?" ly-"+s.ly:"")+(s.bv?" sb":"")+(dk?" dk":li?" lt":"")).trim(),s:st.join(";")}})(),
 W=(id,t,h)=>`<section id="${id}" class="${bg.c}" style="${bg.s}"><div class="w">${t?`<h2>${esc(t)}</h2>`:""}${h}</div></section>`,im=u=>u?` style="background-image:url('${esc(u)}')"`:"";
 switch(K){
 case"services":return c.sv?W("services",s.t||(IND[d.ind]||{}).m||"What we do",`<div class="items">${c.sv}</div>`):"";
 case"calc":return est(d);
 case"about":return d.about?W("about",s.t||"About us",`<p class="about">${esc(d.about)}</p>`):"";
 case"contact":return W("contact",s.t||"Get in touch",`<ul class="inf">${c.info}</ul>${c.btn}`);
 case"gallery":return W("gallery",s.t,`<div class="gal">${it.map((g,i)=>`<figure style="background-image:${g.i?`url('${esc(g.i)}')`:`linear-gradient(${i*47+20}deg,var(--a),var(--b))`}">${g.c?`<figcaption>${esc(g.c)}</figcaption>`:""}</figure>`).join("")}</div>`);
 case"posts":return W("posts",s.t,it.map(p=>`<article class="po"><div class="pi"${p.i?im(p.i):' style="background-image:linear-gradient(135deg,var(--a),var(--b));opacity:.35"'}></div><div><small>${esc(p.dt||"")}</small><h3>${esc(p.t||"")}</h3><p>${esc(p.x||"")}</p>${p.b?`<details class="f"><summary>Read more</summary><p>${esc(p.b)}</p></details>`:""}</div></article>`).join(""));
 case"stats":return W("stats",s.t,`<div class="stats">${it.map(v=>`<div><b>${esc(v.v||"")}</b><span>${esc(v.l||"")}</span></div>`).join("")}</div>`);
 case"quotes":return W("quotes",s.t,`<div class="qs">${it.map(v=>`<blockquote>${esc(v.q||"")}<cite>${esc(v.n||"")}</cite></blockquote>`).join("")}</div>`+(x.pid?`<div id="gr"></div><script>(${GR.toString()})(${JSON.stringify({pid:x.pid,key:x.key||"",proxy:x.proxy||"",max:+x.gmax||5,min:+x.gmin||1}).replace(/</g,"\\u003c")})<\/script>`:""));
 case"faq":return W("faq",s.t,it.map(v=>`<details class="f"><summary>${esc(v.q||"")}</summary><p>${esc(v.a||"")}</p></details>`).join(""));
 case"team":return W("team",s.t,`<div class="team">${it.map(v=>`<div><i${im(v.i)}></i><b>${esc(v.n||"")}</b><div class="mu">${esc(v.r||"")}</div></div>`).join("")}</div>`);
 case"pay":return W("pay",s.t,`<div class="pays">${it.map(p=>`<div class="pay"><h3>${esc(p.t||"")}</h3><p>${esc(p.a||"")}</p><a class="btn" href="${esc(p.u||"#")}" target="_blank" rel="noopener">${esc(p.b||"Pay now")}</a></div>`).join("")}</div>${x.eft?`<h3 class="mt">Bank transfer</h3><pre class="eft">${esc(x.eft)}</pre>`:""}${x.note?`<p class="qn">${esc(x.note)}</p>`:""}`);
 case"donate":{const g=+x.goal||0,r=+x.raised||0,u=(d.q&&d.q.cur)||"R",pc=g?Math.min(100,Math.round(r/g*100)):0;return W("donate",s.t,`<div class="don"><div class="bar2"><i style="width:${pc}%"></i></div><p>${u}${r.toLocaleString("en-ZA")} raised of ${u}${g.toLocaleString("en-ZA")} (${pc}%)</p><div class="chips">${String(x.amts||"").split(",").filter(Boolean).map(v=>`<a class="btn alt" href="${esc(x.link||"#contact")}">${u}${esc(v.trim())}</a>`).join("")}</div>${x.bank?`<p>${esc(x.bank)}</p>`:""}</div>`)}
 case"cta":return `<section class="ctab"><div class="w"><h2>${esc(x.h||"")}</h2><a class="btn" href="${esc(x.l||"#contact")}">${esc(x.b||"Contact us")}</a></div></section>`;
 }return""};
const RDM={menu:"999px",glam:"999px",build:"2px",minimal:"0",brutal:"0",editorial:"0",cyber:"0",bento:"16px"};
function site3(d){
 const f=FAM[d.fam]?d.fam:"ice",p=pal(f,d.pal|0),nm=esc(d.name||"Your Business"),a=d.color||p.a,bgc=d.pbg||p.bg,lt=ink(bgc)==="#111",
 tx=d.pbg?(lt?"#161616":"#f2f2f2"):p.tx,hf=d.hf||p.hf,bf=d.bf||p.bf,bg=d.bg||{},bt=bg.t||"none",L=d.lay||{},
 tel=(d.phone||"").replace(/[^\d+]/g,""),wd=(d.wa||d.phone||"").replace(/\D/g,"").replace(/^0/,"27"),
 BL=d.bl||autoBl(d),has=b=>b.t==="call"?tel:b.t==="wa"?wd:b.t==="mail"?d.email:1,at=k=>BL.filter(b=>b.at===k&&has(b)).map(b=>bh(b,d)).join(""),
 sv=(d.svc||"").split("\n").map(l=>l.trim()).filter(Boolean).map(l=>{const[x,...y]=l.split("|");return `<div class="it"><h3>${esc(x.trim())}</h3><p>${esc(y.join("|").trim())}</p></div>`}).join(""),
 info=[["Phone",d.phone],["Email",d.email],["Where",d.addr],["Hours",d.hours]].filter(x=>x[1]).map(([k,v])=>`<li><b>${k}</b><span>${esc(v)}</span></li>`).join(""),
 media=bt==="image"&&bg.v?`<div class="bgm" style="background-image:url('${esc(bg.v)}')"></div>`:bt==="video"&&bg.v?`<video class="bgm" src="${esc(bg.v)}" autoplay muted loop playsinline></video>`:"",
 hb=media||bt==="anim"?" hb":"",ov=(bt==="anim"?30:(bg.ov===undefined?45:bg.ov))/100,
 hw=FS[hf]===""?400:({minimal:500,brutal:800}[f]||700),fm=[...new Set([hf,bf])].map(fnt).join("&"),
 dc=decor(d,a,p.b),
 body=(d.sec||defSec(d.type||"biz")).filter(s=>s.on).map(s=>{const h=secH(s,d,{sv,info,btn:at("contact")}),x=at("after:"+s.k);return h+(x?`<div class="w ba">${x}</div>`:"")}).join("\n"),
 lic=d.lic?`<meta name="licence" content="${esc(d.lic)}">`:"",
 chk=d.lurl&&d.lic?`<script>(()=>{const u=${JSON.stringify(d.lurl)},k=${JSON.stringify(d.lic)};fetch(u+(u.includes("?")?"&":"?")+"k="+encodeURIComponent(k)+"&h="+encodeURIComponent(location.hostname)).then(r=>r.json()).then(j=>{if(j&&j.ok===false)document.body.innerHTML='<div style="font:18px system-ui;padding:12vh 24px;text-align:center">This site is paused. Please contact the studio.</div>'}).catch(()=>{})})()<\/script>`:"",
 hl=L.hero||"left",ba={center:"center",right:"flex-end"}[L.ba]||"flex-start",
 txt=`<div><h1>${esc(d.head||d.name||"Your Business")}</h1><p>${esc(d.tag||"")}</p><div class="bh" style="justify-content:${ba}">${at("hero")}</div></div>`,
 side=hl==="split"?`<div class="hi" style="background-image:${d.hi?`url('${esc(d.hi)}')`:"linear-gradient(135deg,var(--a),var(--b))"};${d.hi?"":"opacity:.4"}"></div>`:"",
 pgb=d.pg&&d.pg.v?`<div class="pgbg" style="background-image:url('${esc(d.pg.v)}')"></div><div class="pgov" style="opacity:${(d.pg.ov===undefined?70:d.pg.ov)/100}"></div>`:"",
 fl=at("float"),br=at("bar"),pat=dc[0].includes("dcp");
 return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nm}${d.tag?" | "+esc(d.tag):""}</title>
<meta name="description" content="${esc(((d.tag||"")+" "+(d.about||"")).trim().slice(0,155))}">${lic}
<link href="https://fonts.googleapis.com/css2?${fm}&display=swap" rel="stylesheet">
<style>:root{--bg:${bgc};--tx:${tx};--a:${a};--ai:${ink(a)};--b:${p.b};--hf:"${hf}",${SERIF.test(hf)?"Georgia,serif":"system-ui,sans-serif"};--bf:"${bf}",system-ui,sans-serif;--hw:${hw};--rd:${RDM[f]||"12px"};--ov:${ov};--pn:${lt?"#fff":"color-mix(in srgb,"+bgc+",#fff 8%)"};--ln:color-mix(in srgb,var(--tx) 14%,transparent);--mu:color-mix(in srgb,var(--tx) 64%,var(--bg))}${CSSB}${SCSS}${SCSS2}${CSSF[f]||""}${QCSS}${dc[1]}${ovrCss(d)}${br?"body{padding-bottom:76px}":""}</style></head>
<body>${pgb}${pat?dc[0]:""}<header class="top"><div class="w nav"><b>${nm}</b><div class="nb">${tel?`<a href="tel:${esc(tel)}">${esc(d.phone)}</a>`:""}${at("nav")}</div></div></header>
<header class="hero${hb}${bt!=="none"?" bg-"+bt:""} h-${hl}">${media}${pat?"":dc[0]}<div class="w">${hl==="split"?`<div class="sp2">${txt}${side}</div>`:txt}</div></header>
${body}
<footer><div class="w">© ${new Date().getFullYear()} ${nm}${CR(d)}</div></footer>${fl?`<div class="fab">${fl}</div>`:""}${br?`<div class="bbar">${br}</div>`:""}${chk}
</body></html>`}
const gen=d=>site3(d);



const seed=(k,name)=>{const p=IND[k]||IND.trades,L=LOOK[k]||["ice",0],ty=L[2]||"biz",pl=pal(L[0],L[1]),q=parseQ(QS[k]||QS.trades);if(ty==="shop")q.mode="shop";return{ind:k,type:ty,name:name||"Your Business",head:p.h,tag:p.t,about:p.a,svc:p.s,phone:"082 123 4567",wa:"",email:"hello@yourbusiness.co.za",addr:"Serving your local area",hours:"Mon–Fri, 8am–5pm",color:pl.a,fam:L[0],pal:L[1],hf:"",bf:"",pbg:"",bg:{t:"none",v:"",ov:45},sec:defSec(ty),q,lay:{},btn:{},dc:{m:(DEC[k]||["star","scatter"])[0],p:(DEC[k]||["star","scatter"])[1],s:56,o:28,c:""},hi:"",pg:{v:"",ov:70},credit:"",lic:"",lurl:""}};
const fix=d=>{const z=seed(d.ind||"trades");["lay","btn","dc","pg"].forEach(k=>{if(!d[k])d[k]=z[k]});if(d.hi===undefined)d.hi="";defSec("biz").forEach(x=>{if(!d.sec.some(s=>s.k===x.k))d.sec.push(x)});d.sec.forEach(s=>{const K=SK[s.k];if(K&&K.xd)s.x={...K.xd,...(s.x||{})}});return d};

export {gen,site3,defSec,seed,fix,parseQ,FAM,pal,SL,TYPES,SK,IND,QS,LOOK,DEC,MOT,MN,MT,motifOK,TGM,TRADES,EXCL,FONTL,BGT,PLC,RT,GR,esc,ink,hue};
