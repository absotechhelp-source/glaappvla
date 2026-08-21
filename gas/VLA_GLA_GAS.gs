/**
 * VLA Group Life Assurance — GAS Backend v2.0
 * Architecture: GAS = Actuarial Engine + Assumptions + Sheets Storage
 *               HTML = UI only (no rate tables, no pricing logic)
 *
 * Matches the VLA Annuity Tool Phase 2 pattern:
 *   • All rate tables and pricing formulas live here
 *   • HTML sends inputs via GET (?action=calc&q={...}&members={...})
 *   • GAS computes and returns results JSON
 *   • HTML never sees the engine — only inputs and outputs
 *
 * Deploy: Apps Script → Deploy → New Deployment
 *         Type: Web App | Execute as: Me | Access: Anyone
 *
 * NOTE: This file is checked into the glaappvla repo for version control
 * and reference only — it is NOT auto-deployed from git. To ship a
 * change, paste the updated source into the Apps Script editor
 * (script.google.com) and Deploy → Manage Deployments → Edit → New
 * Version, same as always. Saved here 2026-08-20 as the confirmed
 * current production source (matches ADM_DEF's expDiv_fast/expDiv_full
 * split from the Fast/Full independence deploy).
 *
 * ── MERGED PATCHES APPLIED IN THIS FILE ─────────────────────────────────
 *   PATCH A — RET persistence (saveQuoteRET, RET Quotes sheet, routing,
 *             getAllQuotes inclusion)
 *   PATCH B — GLA Fast Quote / Full Quote independent engine parameters
 *             (ADM_DEF split into *_fast / *_full, engineAdmFor(), runCalc()
 *             now selects the mode-specific variant before pricing)
 *
 *   ⚠ If you had previously customized any of expDiv, ciLoad, disFac,
 *   adFac, spSetback, parentOffset, childMort, ciMaxAge, edu_discount_rate
 *   via Admin Settings, that override lived in the "Engine Config" sheet
 *   under the old plain key name. This file only recognises the new
 *   *_fast / *_full names — re-enter those values (once per mode) in
 *   Admin Settings after deploying this version.
 */

// ── CONFIG ───────────────────────────────────────────────────────
const SHEET_ID   = '1prfkqsltM7u72UjJL8l15_cnTvC2G1R_KOs2oV2uJYk';
const SHEET_NAME = 'GLA_App_Quotes';
const APP_TOKEN  = '';          // ← Optional shared secret (set same in HTML ADM)

// ════════════════════════════════════════════════════════════════
// ACTUARIAL ASSUMPTIONS  — edit these to update rates without
// touching the HTML file. Deploy a new version after any change.
// ════════════════════════════════════════════════════════════════

const GLA_RATES={16:0.391190,17:0.375238,18:0.358333,19:0.340119,20:0.320357,21:0.299524,22:0.279881,23:0.264286,24:0.254643,25:0.250119,26:0.251429,27:0.255952,28:0.263095,29:0.274286,30:0.288571,31:0.305000,32:0.321667,33:0.332262,34:0.335714,35:0.335833,36:0.340714,37:0.347976,38:0.348690,39:0.346667,40:0.347024,41:0.366429,42:0.351548,43:0.331905,44:0.338095,45:0.369286,46:0.419405,47:0.475357,48:0.504048,49:0.494881,50:0.489048,51:0.510833,52:0.547976,53:0.595833,54:0.647143,55:0.695357,56:0.737262,57:0.774286,58:0.804524,59:0.826548,60:0.837024,61:0.838571,62:0.838214,63:0.843333,64:0.859762,65:0.882857,66:0.909524,67:0.938929,68:0.969762,69:1.000714,70:1.031071,71:1.060952,72:1.091071,73:1.122143,74:1.154881,75:1.189643,76:1.226667,77:1.265833,78:1.307500,79:1.351667,80:1.398333};

const CI_RATES={15:{M:0.3289,F:0.1951},16:{M:0.3378,F:0.2024},17:{M:0.3653,F:0.1971},18:{M:0.4061,F:0.1864},19:{M:0.4337,F:0.1914},20:{M:0.4780,F:0.2532},21:{M:0.5481,F:0.3385},22:{M:0.6098,F:0.4400},23:{M:0.6712,F:0.5382},24:{M:0.7052,F:0.5831},25:{M:0.7246,F:0.6291},26:{M:0.7696,F:0.6772},27:{M:0.8332,F:0.7869},28:{M:0.8964,F:0.8973},29:{M:0.9434,F:1.0295},30:{M:0.9967,F:1.1714},31:{M:1.0683,F:1.2980},32:{M:1.1509,F:1.4864},33:{M:1.2296,F:1.6716},34:{M:1.3122,F:1.8038},35:{M:1.4641,F:1.9508},36:{M:1.5294,F:2.0697},37:{M:1.7728,F:2.2574},38:{M:2.1204,F:2.4312},39:{M:2.5578,F:2.7169},40:{M:2.9728,F:2.9911},41:{M:3.3741,F:3.2701},42:{M:3.8556,F:3.5208},43:{M:4.3240,F:3.7634},44:{M:4.8476,F:4.0919},45:{M:5.0972,F:4.2429},46:{M:5.5500,F:4.4575},47:{M:6.3402,F:4.8502},48:{M:7.0973,F:5.2204},49:{M:8.0823,F:5.6421},50:{M:9.0426,F:6.0481},51:{M:9.9344,F:6.4269},52:{M:11.0416,F:7.0423},53:{M:12.1116,F:7.6339},54:{M:13.2088,F:8.2379},55:{M:14.3686,F:8.8913},56:{M:14.8944,F:9.2888},57:{M:16.5470,F:9.9678},58:{M:18.2168,F:10.6613},59:{M:19.7751,F:11.5654},60:{M:21.0368,F:12.2617},61:{M:22.5515,F:13.1644},62:{M:24.0474,F:14.0692},63:{M:25.2630,F:14.5598},64:{M:26.1583,F:15.1056},65:{M:26.9326,F:15.5956},66:{M:28.1118,F:16.2624},67:{M:29.2910,F:16.9292},68:{M:30.4702,F:17.5960},69:{M:31.6494,F:18.2628},70:{M:32.8286,F:18.9296},71:{M:34.0078,F:19.5964},72:{M:35.1870,F:20.2632},73:{M:36.3662,F:20.9300},74:{M:37.5454,F:21.5968},75:{M:38.7246,F:22.2636}};

const SECTORS={FIN:{l:'Financial Services / Professional',f:1.00},RET:{l:'Retail / Wholesale Trade',f:1.05},MAN:{l:'Manufacturing / Light Industry',f:1.10},TRN:{l:'Transport / Logistics',f:1.20},CON:{l:'Construction / Civil Engineering',f:1.30},AGR:{l:'Agriculture / Farming',f:1.25},MIN:{l:'Mining / Quarrying',f:1.50},HEA:{l:'Healthcare / Medical',f:1.05},EDU:{l:'Education / Public Sector',f:1.00},SEC:{l:'Security / Protective Services',f:1.35}};

const ADM_DEF={
  // ── GLA — Fast Quote engine ─────────────────────────────────────
  expDiv_fast:1.20, ciLoad_fast:0.20, disFac_fast:0.40, adFac_fast:0.10,
  spSetback_fast:3, parentOffset_fast:20, childMort_fast:0.003, ciMaxAge_fast:75,
  edu_discount_rate_fast:0.15,
  // ── GLA — Full Quote (census) engine ────────────────────────────
  expDiv_full:1.20, ciLoad_full:0.20, disFac_full:0.40, adFac_full:0.10,
  spSetback_full:3, parentOffset_full:20, childMort_full:0.003, ciMaxAge_full:75,
  edu_discount_rate_full:0.15,
  // ── GLA — Product / UI ───────────────────────────────────────────
  validDays:30, funeralMin:500000, funeralMax:20000000, gasUrl:'',
  // ── GFC — Group Funeral Cover (standalone) ─────────────────────
  gfc_expDiv:1.15,          // expense loading divisor (standalone funeral, lighter than GLA)
  gfc_parentLoad:2.80,      // parent mortality loading factor
  gfc_childMort:0.003,      // child mortality rate
  gfc_spSetback:3,          // spouse age setback (years)
  gfc_parentOffset:20,      // parent age offset (years)
  gfc_commission:0.10,      // broker commission
  // ── GFS — Funeral Services packages ───────────────────────────
  gfs_commission:0.10,
  // Package premiums (monthly, MWK) — matches Nacala Logistics defaults
  // Standard | Executive | VIP  (indices 0,1,2)
  gfs_single_std:5700,    gfs_single_exe:9000,    gfs_single_vip:11600,
  gfs_family_std:10700,   gfs_family_exe:17600,   gfs_family_vip:22100,
  gfs_child_std:1300,     gfs_child_exe:2100,     gfs_child_vip:2900,
  gfs_dep70_std:6900,     gfs_dep70_exe:11300,    gfs_dep70_vip:14300,
  gfs_dep80_std:28900,    gfs_dep80_exe:48100,    gfs_dep80_vip:60900,
  gfs_cash_single:2500,   gfs_cash_family:5000,   gfs_cash_child:700,
  gfs_cash_dep:2500,      gfs_cash_benefit:1000000,
  gfs_lieu_std:1600000,   gfs_lieu_exe:2800000,   gfs_lieu_vip:4600000,
  gfs_lieu_transport:1000000, // added for mourners transport (all tiers)
  // ── GCL — Group Credit Life ────────────────────────────────────
  gcl_baseRate:0.0143,      // 1.43% annual on loan amount × (term/12)
  gcl_minRate:0.0070,       // 0.70% floor (minimum of loan amount)
  gcl_ciRiderPct:0.0025,    // CI rider: 0.25% add-on rate per loan
  gcl_hospPa:1800,          // hospitalisation flat rate per member per year (MWK)
  gcl_funBorrower:500000,   // funeral cash — borrower
  gcl_funSpouse:500000,     // funeral cash — spouse
  gcl_funChild:300000,      // funeral cash — child (up to 2)
  gcl_commission:0.10,
  gcl_maxAge:65,
  gcl_maxLoan:40000000,     // MWK 40M
  gcl_maxTerm:96,           // months
  // ── RET — Retrenchment + Abscondence ──────────────────────────
  ret_rateMonthly:0.0024,   // 0.24% per month of loan × term (once-off single prem)
  ret_absRateMonthly:0.0016,// 0.16% per month — abscondence rider add-on
  ret_benefitMonths:6,      // months of instalments paid on claim
  ret_qualifyingDays:90,    // qualifying period for abscondence
  ret_aggCap:60000000,      // annual aggregate claim cap (MWK 60M)
  ret_commission:0.10,
  ret_maxAge:70,
  ret_maxTerm:60,           // months
};

const TIERS=[{l:'Small (<50)',n:1,maxD:0.05,maxL:0.25},{l:'Small-Med (50–99)',n:50,maxD:0.08,maxL:0.20},{l:'Medium (100–199)',n:100,maxD:0.15,maxL:0.15},{l:'Med-Large (200–499)',n:200,maxD:0.20,maxL:0.12},{l:'Large (500–999)',n:500,maxD:0.25,maxL:0.10},{l:'Very Large (1000+)',n:1000,maxD:0.30,maxL:0.08}];

// ════════════════════════════════════════════════════════════════
// CALCULATION ENGINE  — ported verbatim from HTML; GAS is the
// single source of truth.  HTML has no copy of this logic.
// ════════════════════════════════════════════════════════════════

const glaR=a=>GLA_RATES[Math.min(Math.max(Math.round(+a),16),80)]||GLA_RATES[80];
const ciR=(a,g)=>{const k=Math.min(Math.max(Math.round(+a),15),75);return (CI_RATES[k]||CI_RATES[75])[g==='F'?'F':'M'];};
const indF=s=>(SECTORS[s]||{f:1}).f;
const getTier=n=>[...TIERS].reverse().find(t=>(+n)>=t.n)||TIERS[0];

function capFactor(cap,mult){
  const m={follow_gla:+mult,'25_pct':0.25,'50_pct':0.50,'75_pct':0.75,'100_pct':1.0,'1x_salary':1.0};
  return m[cap]!=null?m[cap]:1.0;
}

function parseDOB(dob,comm){
  const s=String(dob).trim();
  let b;
  if(/^\d{4,5}$/.test(s)){
    const d=new Date((+s-25569)*86400*1000);
    b=new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  } else {
    const m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    b=m?new Date(+m[1],+m[2]-1,+m[3]):new Date(s);
  }
  if(isNaN(b))return null;
  const c=comm?new Date(comm+'T00:00:00'):new Date();
  let age=c.getFullYear()-b.getFullYear();
  const mDiff=c.getMonth()-b.getMonth();
  if(mDiff<0||(mDiff===0&&c.getDate()<b.getDate()))age--;
  return Math.max(16,Math.min(80,age));
}

// ── EDUCATION COVER DEMOGRAPHIC HELPERS ─────────────────────────────
// Offline piecewise approximations — no secondary tables required.
function getPkids(age){
  if(age<31)return 0.05;
  if(age<40)return 0.05+0.0778*(age-31);
  if(age<48)return 0.75+0.0100*(age-40);
  if(age<53)return 0.83-0.0980*(age-48);
  if(age<58)return 0.34-0.0580*(age-53);
  return 0.05;
}
function getAvgKids(age){
  if(age<47)return 1.40;
  return Math.max(1.0,1.40-(age-47)*0.057);
}

function memberPrem(m,q,adm){
  const sal=+m.annual_salary||0;
  const age=+m.age_nearest||30;
  const gen=(m.gender||'M').toUpperCase();
  const{mult,sec,ci_cap,inc_funeral,f_scope,f_mBen,f_nCh,f_cPct,f_nPar,f_pPct,
    inc_ci,inc_dis,dis_cap,inc_ad,inc_sp,sp_pct,sp_mar,
    inc_adb,adb_accel_pct,inc_edu,edu_fee_annual,edu_max_children,edu_max_years,
    edu_discount_rate,edu_pct_with_kids,edu_avg_kids}=q;
  const{expDiv,ciLoad,disFac,adFac,spSetback,parentOffset,childMort,ciMaxAge}=adm;
  const g2=+mult,ind=indF(sec);

  // 1. Core GLA — loaded via expDiv (Rule #1)
  const gla=(sal*g2/1000)*glaR(age)*ind/expDiv;

  // 2. Funeral Rider — net of expDiv, child cap=4, parent cap=2, parent loading ×2.8
  let funeral=0;
  if(inc_funeral){
    const mb=parseFloat(f_mBen)||0;
    const nc=Math.min(parseInt(f_nCh)||0,4);
    const np=Math.min(parseInt(f_nPar)||0,2);
    const cPct=+f_cPct||0.50,pPct=+f_pPct||0.25;
    const spAge=Math.max(16,age-spSetback);
    if(f_scope==='member_only'){
      funeral=(mb/1000)*glaR(age);
    } else {
      funeral=((mb/1000)*glaR(age))+((mb*0.5/1000)*glaR(spAge))+((mb*cPct*nc/1000)*childMort);
      if(np>0)funeral+=(mb*pPct*np/1000)*glaR(Math.min(80,age+parentOffset))*2.8;
    }
  }

  // 3. Critical Illness
  let ci=0;
  if(inc_ci&&age<=ciMaxAge){
    ci=((sal*capFactor(ci_cap,g2))/1000)*ciR(age,gen)/(1+(+ciLoad))/12;
  }

  // 4. Total Permanent Disability — standalone, gender-neutral blend (Rule #3)
  let dis=0;
  if(inc_dis){
    const blended=(ciR(age,'M')+ciR(age,'F'))/2;
    dis=((sal*capFactor(dis_cap,g2))/1000)*blended/(1+(+ciLoad))*disFac/12;
  }

  // 5. Accidental Death Cover (standard — flat % of loaded GLA)
  const ad=inc_ad?gla*adFac:0;

  // 6. Spouse GLA — corrected, no /2, with expDiv (Rule #4)
  let sp=0;
  if(inc_sp){
    sp=(sal*g2*(+sp_pct)*(+sp_mar)/1000)*glaR(Math.max(16,age-spSetback))*ind/expDiv;
  }

  // 7. Advanced Rider: Accelerated Death Benefit
  let adb=0;
  if(inc_adb){
    const accelPct=parseFloat(adb_accel_pct)||0.20;
    const incRate=Math.max(0,(ciR(age,gen)/(1+(+ciLoad)))-(glaR(age)*0.70));
    const targetBen=Math.min(sal*g2,(ci_cap==='1x_salary'?sal:sal*g2));
    adb=(accelPct*incRate*targetBen)/12000;
  }

  // 8. Advanced Rider: Education Cover
  let edu=0;
  if(inc_edu){
    const r=parseFloat(edu_discount_rate)||(adm.edu_discount_rate||0.15);
    const nYrs=parseInt(edu_max_years)||6;
    const pKids=(edu_pct_with_kids==='auto'||!edu_pct_with_kids)?getPkids(age):parseFloat(edu_pct_with_kids);
    const aKids=(edu_avg_kids==='auto'||!edu_avg_kids)?getAvgKids(age):parseFloat(edu_avg_kids);
    const annuityFactor=((1-Math.pow(1+r,-nYrs))/r)*(1+r);
    const maxKids=parseInt(edu_max_children)||3;
    const expectedBen=pKids*Math.min(aKids,maxKids)*0.50*annuityFactor*(parseFloat(edu_fee_annual)||0);
    if((sal*g2)>0)edu=gla*(expectedBen/(sal*g2));
  }

  return{gla,funeral,ci,dis,ad,sp,adb,edu,total:(gla+funeral+ci+dis+ad+sp+adb+edu)};
}

function fastQuote(q,adm){
  const{n:N,sal:tS,age:aa,pf,mult,sec,inc_funeral,f_scope,f_mBen,f_nCh,f_cPct,f_nPar,f_pPct,
    funeral_mode,funeral_categories,
    inc_ci,ci_cap,inc_dis,dis_cap,inc_ad,inc_sp,sp_pct,sp_mar,disc,load,
    inc_adb,adb_accel_pct,inc_edu,edu_fee_annual,edu_max_children,edu_max_years,
    edu_discount_rate,edu_pct_with_kids,edu_avg_kids}=q;
  const{expDiv,ciLoad,disFac,adFac,spSetback,parentOffset,childMort,ciMaxAge}=adm;
  const n=+N,ts=+tS,a=+aa,pf2=+pf,g=+mult,ind=indF(sec),sp=+sp_pct,pm=+sp_mar;
  const gla=(ts*g/1000)*glaR(a)*ind/expDiv;

  // Per-member funeral premium for a given member benefit amount (mb).
  // Scope, children/parent counts and their % are shared assumptions
  // across categories — only the benefit amount itself varies.
  function funeralPerMember(mb){
    const nc=Math.min(+f_nCh||0,4),np=Math.min(+f_nPar||0,2);
    const cPct=+f_cPct||0.50,pPct=+f_pPct||0.25;
    const spAge=Math.max(16,a-spSetback);
    if(f_scope==='member_only'){
      return (mb/1000)*glaR(a);
    }
    let per=(mb/1000)*glaR(a)+(mb*0.5/1000)*glaR(spAge)+(mb*cPct*nc/1000)*childMort;
    if(np>0)per+=(mb*pPct*np/1000)*glaR(Math.min(80,a+parentOffset))*2.8;
    return per;
  }

  let funeral=0;
  if(inc_funeral){
    if(funeral_mode==='category'&&Array.isArray(funeral_categories)&&funeral_categories.length>0){
      // Category Split — each category has its own headcount (direct or
      // % of total staff) and benefit amount; scope/children/parent %
      // remain shared assumptions applied per category.
      funeral_categories.forEach(function(cat){
        const mb=+cat.mBen||0;
        if(mb<=0)return;
        let catN;
        if(cat.mode==='headcount'){
          catN=Math.max(0,+cat.value||0);
        } else {
          catN=Math.round(Math.max(0,+cat.value||0)/100*n);
        }
        catN=Math.min(catN,n); // never exceed total census, even if mis-entered
        funeral+=catN*funeralPerMember(mb);
      });
    } else {
      const mb=+f_mBen||0;
      funeral=n*funeralPerMember(mb);
    }
  }
  let ci=0;
  if(inc_ci&&a<=ciMaxAge){
    const b=ts*capFactor(ci_cap,g);
    const bl=(1-pf2)*ciR(a,'M')+pf2*ciR(a,'F');
    ci=(b/1000)*bl/(1+ciLoad)/12;
  }
  let dis=0;
  if(inc_dis){
    const b=ts*capFactor(dis_cap,g);
    const bl=(ciR(a,'M')+ciR(a,'F'))/2;
    dis=(b/1000)*bl/(1+ciLoad)*disFac/12;
  }
  const ad=inc_ad?gla*adFac:0;
  let spGla=0;
  if(inc_sp)spGla=(ts*g*sp*pm/1000)*glaR(a)*ind/expDiv;
  // Advanced Rider: Accelerated Death Benefit
  let adb_pm=0;
  if(inc_adb){
    const accelPct=parseFloat(adb_accel_pct)||0.20;
    const incRateM=Math.max(0,(ciR(a,'M')/(1+ciLoad))-(glaR(a)*0.70));
    const incRateF=Math.max(0,(ciR(a,'F')/(1+ciLoad))-(glaR(a)*0.70));
    const blendedIncRate=(1-pf2)*incRateM+pf2*incRateF;
    adb_pm=accelPct*blendedIncRate*ts*g/12000;
  }
  // Advanced Rider: Education Cover
  let edu_pm=0;
  if(inc_edu){
    const r=parseFloat(edu_discount_rate)||(adm.edu_discount_rate||0.15);
    const nYrs=parseInt(edu_max_years)||6;
    const pKids=(edu_pct_with_kids==='auto'||!edu_pct_with_kids)?getPkids(a):parseFloat(edu_pct_with_kids);
    const aKids=(edu_avg_kids==='auto'||!edu_avg_kids)?getAvgKids(a):parseFloat(edu_avg_kids);
    const annuityFactor=((1-Math.pow(1+r,-nYrs))/r)*(1+r);
    const maxKids=parseInt(edu_max_children)||3;
    const expectedBen=pKids*Math.min(aKids,maxKids)*0.50*annuityFactor*(parseFloat(edu_fee_annual)||0);
    const avgGLABen=(n>0?ts/n:ts)*g;
    if(avgGLABen>0)edu_pm=gla*(expectedBen/avgGLABen);
  }
  const base=gla+funeral+ci+dis+ad+spGla+adb_pm+edu_pm;
  const nm=1-(+disc||0)+(+load||0);
  const total_pm=base*nm,total_pa=total_pm*12;
  // nm applied here too (not just to total_pm) so the fixed/scalable split
  // stays consistent whenever a discount or loading is in use — otherwise
  // every GLA Cover Options row except the one actually selected comes out
  // wrong by an amount proportional to the loading/discount. Confirmed via
  // two real quotes for the same scheme (5% loading) differing by ~3.9% on
  // an option row that should have been identical.
  //
  // edu_pm is included here too — the education-cover formula above
  // (gla * expectedBen/avgGLABen) divides out the g it multiplied in, so
  // edu_pm is mathematically independent of the GLA Multiple despite being
  // computed via gla. Left out of the "scalable" bucket, it would otherwise
  // get scaled proportionally across every option row it has no business
  // moving on. Verified numerically: it's identical at every multiple.
  const fixed_pm=(funeral+(ci_cap!=='follow_gla'?ci:0)+(dis_cap!=='follow_gla'?dis:0)+edu_pm)*nm;
  const scalable_pm=total_pm-fixed_pm;
  const inc_pm=scalable_pm/g;
  const options=[1,2,3,4,5].map(k=>({k,pa:(fixed_pm+k*inc_pm)*12}));
  return{gla,funeral,ci,dis,ad,sp:spGla,adb:adb_pm,edu:edu_pm,base,total_pm,total_pa,nm,
    rate_pct:total_pa/(ts||1),per_mb:total_pm/(n||1),options,avgAge:a,totSal:ts,nMem:n};
}

function fullQuote(members,q,adm){
  const{mult,disc,load,ci_cap,dis_cap}=q;
  let gla=0,funeral=0,ci=0,dis=0,ad=0,sp=0,adb=0,edu=0;
  members.forEach(m=>{const r=memberPrem(m,q,adm);gla+=r.gla;funeral+=r.funeral;ci+=r.ci;dis+=r.dis;ad+=r.ad;sp+=r.sp;adb+=r.adb;edu+=r.edu;});
  const base=gla+funeral+ci+dis+ad+sp+adb+edu;
  const nm=1-(+disc||0)+(+load||0);
  const total_pm=base*nm,total_pa=total_pm*12;
  const ts=members.reduce((s,m)=>s+m.annual_salary,0);
  const g=+mult;
  // nm applied here too (not just to total_pm) so the fixed/scalable split
  // stays consistent whenever a discount or loading is in use — otherwise
  // every GLA Cover Options row except the one actually selected comes out
  // wrong by an amount proportional to the loading/discount. Confirmed via
  // two real quotes for the same scheme (5% loading) differing by ~3.9% on
  // an option row that should have been identical.
  //
  // edu is included here too — same reasoning as fastQuote(): the
  // per-member education-cover formula divides out the multiple it
  // multiplied in, so it's mathematically independent of the GLA Multiple
  // despite being computed via each member's gla. Left in the "scalable"
  // bucket, it would get scaled proportionally across every option row.
  const fixed_pm=(funeral+(ci_cap!=='follow_gla'?ci:0)+(dis_cap!=='follow_gla'?dis:0)+edu)*nm;
  const scalable_pm=total_pm-fixed_pm;
  const inc_pm=scalable_pm/g;
  const options=[1,2,3,4,5].map(k=>({k,pa:(fixed_pm+k*inc_pm)*12}));
  const avgAge=members.reduce((s,m)=>s+m.age_nearest,0)/members.length;
  return{gla,funeral,ci,dis,ad,sp,adb,edu,base,total_pm,total_pa,nm,
    rate_pct:total_pa/(ts||1),per_mb:total_pm/(members.length||1),options,
    avgAge,totSal:ts,nMem:members.length};
}

// ════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════
// POST requests (used for the PDF archive upload, where a base64 PDF
// payload can easily exceed the ~8KB practical limit on GET query
// strings) are routed through the exact same action switch as GET —
// Apps Script populates e.parameter identically for form-encoded POST
// bodies, so no separate routing logic is needed.
function doPost(e) {
  return doGet(e);
}

function doGet(e) {
  const p = e.parameter;
  const action = p.action || 'ping';
  try {
    // Token guard — every action except ping, login and getConfig requires
    // a valid unexpired session token.
    // • ping  : open — used to test connectivity before anyone is logged in.
    // • login : open — this is how a token is obtained in the first place.
    // • getConfig : open — fetched at startup (before login) to load sectors,
    //               tiers and admin defaults into the HTML UI.
    if (action !== 'ping' && action !== 'login' && action !== 'getConfig') {
      const tokenCheck = validateToken(p.token);
      if (!tokenCheck.valid) {
        return ok({ error: 'Session expired. Please log in again.' });
      }
      p.session = { username: tokenCheck.username, role: tokenCheck.role };
    }
    switch (action) {
      case 'ping':
        return ok({ status:'ok', message:'VLA GLA Engine GAS v2.0',
                     timestamp:new Date().toISOString(), engine:'GAS' });
      case 'calc':
        return ok(runCalc(p));
      case 'calcGFC':
        return ok(runCalcGFC(p));
      case 'calcGFS':
        return ok(runCalcGFS(p));
      case 'calcGCL':
        return ok(runCalcGCL(p));
      case 'calcRET':
        return ok(runCalcRET(p));
      case 'getConfig':
        return ok(getConfig());
      case 'saveConfig':
        return ok(saveConfig(p));
      case 'uploadQuotePDF':
        return ok(uploadQuotePDF(p));
      case 'getPdfArchive':
        return ok(getPdfArchive(p));
      case 'saveQuote':
        return ok(saveQuote(p));
      case 'saveQuoteGFC':
        return ok(saveQuoteGFC(p));
      case 'saveQuoteGFS':
        return ok(saveQuoteGFS(p));
      case 'saveQuoteGCL':
        return ok(saveQuoteGCL(p));
      case 'saveQuoteRET':
        return ok(saveQuoteRET(p));
      case 'getQuotes':
        return ok(getQuotes(p));
      case 'getAllQuotes':
        return ok(getAllQuotes(p));
      case 'getQuote':
        return ok(getQuote(p));
      case 'deleteQuote':
        return ok(deleteQuote(p));
      case 'login':
        return ok(login(p));
      case 'getUsers':
        return ok(getUsersList(p));
      case 'saveUser':
        return ok(saveUser(p));
      case 'deleteUser':
        return ok(deleteUser(p));
      default:
        return ok({ status:'error', message:'Unknown action: ' + action });
    }
  } catch(err) {
    return ok({ status:'error', message:err.toString() });
  }
}

// ── CALC HANDLER ─────────────────────────────────────────────────
// Selects the Fast-Quote or Full-Quote variant of every GLA engine
// parameter and exposes it under the plain (un-suffixed) key that
// fastQuote() / fullQuote() / memberPrem() already destructure — so
// none of those pricing functions need to change, only which values
// they're handed. [PATCH B]
function engineAdmFor(mode, adm) {
  var suffix = mode === 'full' ? '_full' : '_fast';
  var keys = ['expDiv','ciLoad','disFac','adFac','spSetback','parentOffset','childMort','ciMaxAge','edu_discount_rate'];
  var out = {};
  for (var k in adm) out[k] = adm[k];
  keys.forEach(function(k) { out[k] = adm[k + suffix]; });
  return out;
}

function runCalc(p) {
  if (!p || !p.q) return { error: 'Missing parameters — call via HTTP GET with action and q params.' };
  let q;
  try { q = JSON.parse(decodeURIComponent(p.q)); } catch(e) { return { error: 'Invalid q parameter: ' + e.message }; }

  // Base assumptions always start from server defaults (authoritative)
  let adm = readPersistedConfig();  // server-authoritative — includes any admin-saved overrides
  // Admin-only override: merge client-supplied assumptions into the engine
  // p.session is set by the token guard above — only admins can reach this branch
  if (p.session && p.session.role === 'admin' && p.adm) {
    try {
      const clientAdm = JSON.parse(decodeURIComponent(p.adm));
      const allowed   = Object.keys(ADM_DEF);
      allowed.forEach(function(k) {
        // Only accept numeric overrides for known ADM keys — rejects strings/injections
        if (clientAdm[k] !== undefined && typeof clientAdm[k] === 'number') {
          adm[k] = clientAdm[k];
        }
      });
    } catch(e) {}  // malformed payload → silently fall back to server defaults
  }
  const mode = q.mode || 'fast';
  // Fast Quote and Full Quote now price off independent copies of every
  // engine parameter — see engineAdmFor() above. [PATCH B]
  const modeAdm = engineAdmFor(mode, adm);

  if (mode === 'fast') {
    const results = fastQuote(q, modeAdm);
    return { status:'ok', mode:'fast', engine:'GAS v2.0', results };
  }

  // Full Quote: members sent as compact [[gender,age,salary],...] array
  const raw = JSON.parse(decodeURIComponent(p.members || '[]'));
  if (!raw.length) return { status:'error', message:'No members provided for Full Quote.' };

  const members = raw.map(function(m, i) {
    return {
      id:           i + 1,
      gender:       m[0],
      age_nearest:  +m[1],
      annual_salary:+m[2],
      ci_excluded:  +m[1] > (modeAdm.ciMaxAge || 75),
    };
  });

  const results = fullQuote(members, q, modeAdm);
  return { status:'ok', mode:'full', engine:'GAS v2.0', nMem:members.length, results };
}

// ── CONFIG ENDPOINT ───────────────────────────────────────────────
// Called by HTML at startup (before login) to load sectors, tiers and
// admin parameter defaults. No token required — see token guard above.
// Key name 'adminDefaults' matches applyGASConfig() in the HTML.
// ── ENGINE CONFIG — persisted admin overrides, shared across ALL devices ──
// Root cause this fixes: Admin Settings previously only ever wrote to the
// browser's own localStorage, so a rate change made on one device was
// invisible everywhere else — including other admins and every ordinary
// user, since the actual pricing engine here in GAS never learned about it.
// This sheet is the single source of truth every device now reads from.
const CONFIG_SHEET_NAME = 'Engine Config';

function getConfigSheet() {
  const ss = SHEET_ID
    ? SpreadsheetApp.openById(SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
    sheet.appendRow(['Parameter', 'Value', 'Last Updated', 'Updated By']);
    sheet.getRange(1,1,1,4).setBackground('#641414').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Reads any persisted overrides from the Engine Config sheet, merged on
// top of the script's hardcoded ADM_DEF. Keys never overridden simply
// keep their ADM_DEF default.
function readPersistedConfig() {
  const sheet = getConfigSheet();
  const lastRow = sheet.getLastRow();
  const merged = {...ADM_DEF};
  if (lastRow < 2) return merged;
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  data.forEach(function(row) {
    const key = row[0], val = row[1];
    if (key && ADM_DEF.hasOwnProperty(key) && typeof val === 'number') {
      merged[key] = val;
    }
  });
  return merged;
}

// Admin-only. Persists changed parameters to the Engine Config sheet so
// every device picks them up on its next getConfig call.
function saveConfig(p) {
  if (!p.session || p.session.role !== 'admin') {
    return { status:'error', message:'Only administrators can update engine parameters.' };
  }
  let changes;
  try { changes = JSON.parse(decodeURIComponent(p.config)); }
  catch(e) { return { status:'error', message:'Invalid config payload: ' + e.message }; }

  const sheet = getConfigSheet();
  const lastRow = sheet.getLastRow();
  const existingKeys = {};
  if (lastRow >= 2) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    keys.forEach(function(row, i) { if (row[0]) existingKeys[row[0]] = i + 2; });
  }
  const now = new Date().toISOString();
  const who = p.session.username || 'unknown';
  let updated = 0;
  Object.keys(changes).forEach(function(key) {
    if (!ADM_DEF.hasOwnProperty(key) || typeof changes[key] !== 'number') return; // reject unknown/non-numeric keys
    if (existingKeys[key]) {
      sheet.getRange(existingKeys[key], 2, 1, 3).setValues([[changes[key], now, who]]);
    } else {
      sheet.appendRow([key, changes[key], now, who]);
    }
    updated++;
  });
  return { status:'ok', message: updated + ' parameter(s) saved — now live for every device.', updated: updated };
}

// ── PDF ARCHIVE — central Drive store, rights enforced at read time ────
// Design: PDFs live in one shared Drive folder rather than per-user
// folders with individual sharing permissions — that would mean
// managing Drive ACLs per file, which doesn't scale and drifts out of
// sync easily. Instead, every upload is indexed in a metadata sheet
// with who prepared it, and getPdfArchive() filters that index by the
// requester's role before returning anything — the same
// application-layer rights pattern already used everywhere else in
// this backend (admin-only actions checked via p.session.role), not a
// Drive-permissions scheme.
const PDF_ARCHIVE_SHEET_NAME = 'PDF Archive';
const PDF_ARCHIVE_FOLDER_NAME = 'VLA Quote PDF Archive';

function getPdfArchiveSheet() {
  const ss = SHEET_ID
    ? SpreadsheetApp.openById(SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PDF_ARCHIVE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PDF_ARCHIVE_SHEET_NAME);
    sheet.appendRow(['Timestamp','Product','Quote Ref','Company','Drive File ID','Drive View URL','Prepared By (username)','Acting FA','Uploaded By']);
    sheet.getRange(1,1,1,9).setBackground('#641414').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Caches the archive folder's ID in Script Properties after first
// creation, rather than searching Drive by name on every call.
// getFoldersByName() requires broad Drive access (scope: drive or
// drive.readonly) because it can see your entire Drive; getFolderById()
// on a folder the script already created/knows about only needs the
// much narrower drive.file scope. If you still hit an authorization
// error after this change, open the Apps Script editor, select any
// function in the Run dropdown, click Run once, and approve the
// permissions Google prompts for — then redeploy (Deploy > Manage
// Deployments > Edit > New Version) so the web app picks up the grant.
// Run this ONE function directly from the Apps Script editor (select
// "authorizeDriveAccess" in the Run dropdown, then click Run) to trigger
// Google's permission prompt for the PDF archive's Drive access. Unlike
// doGet/doPost, this takes no parameters, so it's always safe to run
// standalone from the editor — it won't throw the "Cannot read
// properties of undefined (reading 'parameter')" error that doGet does
// when run this way, since that error only happens to functions that
// expect a real HTTP request object.
function authorizeDriveAccess() {
  const folder = getOrCreateArchiveFolder();
  Logger.log('Drive access authorized successfully.');
  Logger.log('Archive folder: ' + folder.getName());
  Logger.log('Folder URL: ' + folder.getUrl());
  return 'OK — archive folder ready: ' + folder.getUrl();
}

function getOrCreateArchiveFolder() {
  const props = PropertiesService.getScriptProperties();
  const cachedId = props.getProperty('PDF_ARCHIVE_FOLDER_ID');
  if (cachedId) {
    try { return DriveApp.getFolderById(cachedId); }
    catch(e) { /* folder was deleted/moved — fall through and recreate */ }
  }
  const folder = DriveApp.createFolder(PDF_ARCHIVE_FOLDER_NAME);
  props.setProperty('PDF_ARCHIVE_FOLDER_ID', folder.getId());
  return folder;
}

// Any authenticated user (fa/ts/admin) can archive a PDF they generated.
// Stores the file in Drive and indexes it with who prepared the quote,
// so getPdfArchive() can later enforce FA-sees-own-only visibility.
function uploadQuotePDF(p) {
  if (!p.session) return { status:'error', message:'Not authenticated.' };
  const b64 = p.pdfBase64;
  if (!b64) return { status:'error', message:'No PDF data received.' };

  const product  = (p.product || 'gla').toUpperCase();
  const ref      = p.ref || ('quote_' + Date.now());
  const company  = p.company || 'Unnamed';
  const preparedBy = p.preparedBy || p.session.username || 'unknown';
  const actingFA    = p.actingFA || '';

  let file;
  try {
    const bytes = Utilities.base64Decode(b64.replace(/^data:application\/pdf;base64,/, ''));
    const blob  = Utilities.newBlob(bytes, 'application/pdf', 'VLA-' + product + '-' + company.replace(/[^A-Za-z0-9]/g,'_') + '-' + ref + '.pdf');
    const folder = getOrCreateArchiveFolder();
    file = folder.createFile(blob);
  } catch(e) {
    return { status:'error', message:'Upload failed: ' + e.message };
  }

  const sheet = getPdfArchiveSheet();
  // De-dup by ref: if this quote's PDF was already archived (e.g.
  // regenerated after a revision), replace the row rather than
  // accumulating duplicate files for the same quote.
  const lastRow = sheet.getLastRow();
  let targetRow = 0;
  if (lastRow >= 2) {
    const refs = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
    for (var i = 0; i < refs.length; i++) {
      if (String(refs[i][0]).trim() === String(ref).trim()) { targetRow = i + 2; break; }
    }
  }
  const row = [new Date().toISOString(), product, ref, company, file.getId(), file.getUrl(), preparedBy, actingFA, p.session.username];
  if (targetRow > 0) {
    // Delete the superseded file so the Drive folder doesn't accumulate
    // stale copies of the same quote every time it's regenerated.
    try {
      const oldId = sheet.getRange(targetRow, 5).getValue();
      if (oldId) DriveApp.getFileById(oldId).setTrashed(true);
    } catch(e) {}
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return { status:'ok', message:'PDF archived.', fileId: file.getId(), url: file.getUrl() };
}

// Returns the archive index, filtered by the requester's role:
//   fa    → only quotes they prepared, or prepared on their behalf
//   ts    → everything (Technical Services quotes on behalf of FAs)
//   admin → everything
// Matched by username throughout (not display name) — p.session only
// ever carries {username, role}, and display-name matching would be
// fragile against typos/variants anyway.
function getPdfArchive(p) {
  if (!p.session) return { status:'error', message:'Not authenticated.' };
  const sheet = getPdfArchiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { status:'ok', files:[] };
  const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  let rows = data.map(function(r) {
    return { savedAt:r[0], product:r[1], ref:r[2], company:r[3], fileId:r[4], url:r[5], preparedBy:r[6], actingFA:r[7], uploadedBy:r[8] };
  });
  if (p.session.role === 'fa') {
    const me = (p.session.username || '').toLowerCase();
    rows = rows.filter(function(r) {
      return (r.preparedBy||'').toLowerCase() === me
          || (r.uploadedBy||'').toLowerCase() === me
          || (r.actingFA||'').toLowerCase() === me;
    });
  }
  rows.sort(function(a,b){ return new Date(b.savedAt) - new Date(a.savedAt); });
  return { status:'ok', files: rows, count: rows.length };
}

function getConfig() {
  return {
    status:        'ok',
    engine:        'GAS v2.0',
    sectors:       SECTORS,
    tiers:         TIERS,
    adminDefaults: readPersistedConfig(),   // HTML reads cfg.adminDefaults — now server-authoritative
    rateVersion:   'GLA-2026-06',
    lastUpdated:   '2026-06-20',
  };
}

// ── SHEET STORAGE ────────────────────────────────────────────────
function saveQuote(p) {
  const ss = getSheet();
  const d  = p.data ? JSON.parse(decodeURIComponent(p.data)) : p;
  // Safety net: any GFC/GFS/GCL/RET quote (by product flag or ref prefix)
  // is routed to its own sheet — the GLA Quotes sheet must only ever
  // contain GLA rows.
  if (d.product === 'gfc' || String(d.ref||'').indexOf('gfc_') === 0) {
    return saveQuoteGFC(p);
  }
  if (d.product === 'gfs' || String(d.ref||'').indexOf('gfs_') === 0) {
    return saveQuoteGFS(p);
  }
  if (d.product === 'gcl' || String(d.ref||'').indexOf('gcl_') === 0) {
    return saveQuoteGCL(p);
  }
  if (d.product === 'ret' || String(d.ref||'').indexOf('ret_') === 0) {
    return saveQuoteRET(p);
  }
  ensureHeader(ss);
  const row = [
    new Date().toISOString(),
    d.ref          || '',
    d.company      || '',
    d.mode         || 'fast',
    d.nMembers     || 0,
    d.payroll      || 0,
    d.multiple     || 3,
    d.annualPremium|| 0,
    d.date         || '',
    d.sector       || '',
    d.prepBy       || '',
    JSON.stringify(d.benefits || {}),
    'Active',
    d.fullData     || '',   // col 14 — full Q+RESULTS JSON for cross-device restore
    d.preparedByUsername || '',  // col 15 — reliable login username, for rights filtering
    d.actingFAUsername   || '',  // col 16 — acting FA's username, if quoted on their behalf
  ];
  ss.appendRow(row);
  const lastRow = ss.getLastRow();
  ss.getRange(lastRow, 8).setNumberFormat('#,##0');
  ss.getRange(lastRow, 6).setNumberFormat('#,##0');
  return { status:'ok', message:'Quote saved', ref:d.ref || row[0], row:lastRow };
}

/* ── GFC Quotes — separate sheet tab ─────────────────────────────────── */
const GFC_SHEET_NAME = 'GFC Quotes';

function getGFCSheet() {
  const ss = SHEET_ID
    ? SpreadsheetApp.openById(SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GFC_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(GFC_SHEET_NAME);
    sheet.appendRow([
      'Timestamp','Quote Ref','Company','Mode','Members',
      'Avg Age','Cover Scope','Parents Included','Annual Salary Bill (MWK)','Monthly Premium (MWK)',
      'Monthly per Member (MWK)','Annual Premium (MWK)','Commencement','Prepared By','Benefits JSON','Status',
      'Prepared By (username)','Acting FA (username)',
    ]);
  }
  return sheet;
}

function saveQuoteGFC(p) {
  const sheet = getGFCSheet();
  const d = p.data ? JSON.parse(decodeURIComponent(p.data)) : p;
  const row = [
    new Date().toISOString(),
    d.ref           || '',
    d.company       || '',
    d.mode          || 'fast',
    d.n             || 0,
    d.avg_age       || 0,
    d.f_scope       || '',
    d.parents_included || 'No',
    d.sal_bill      || 0,
    d.total_monthly || 0,
    d.monthly_per_member || 0,
    d.total_pa      || 0,
    d.date          || '',
    d.prepBy        || '',
    JSON.stringify(d.tiers || d.benefits || {}),
    'Active',
    d.preparedByUsername || '',
    d.actingFAUsername   || '',
  ];
  // Dedup by Quote Ref: update existing row in place rather than appending
  const ref = String(d.ref||'').trim();
  let targetRow = 0, updated = false;
  if (ref && sheet.getLastRow() > 1) {
    const refs = sheet.getRange(2, 2, sheet.getLastRow()-1, 1).getValues();
    for (var i = 0; i < refs.length; i++) {
      if (String(refs[i][0]).trim() === ref) { targetRow = i + 2; break; }
    }
  }
  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    updated = true;
  } else {
    sheet.appendRow(row);
    targetRow = sheet.getLastRow();
  }
  sheet.getRange(targetRow, 9, 1, 4).setNumberFormat('#,##0');
  return { status:'ok', updated: updated,
    message: updated ? 'GFC quote updated (ref exists — no duplicate created)' : 'GFC quote saved',
    ref: ref || row[0], row: targetRow };
}

/* ── GFS Quotes — separate sheet tab ─────────────────────────────────── */
const GFS_SHEET_NAME = 'GFS Quotes';

function getGFSSheet() {
  const ss = SHEET_ID
    ? SpreadsheetApp.openById(SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GFS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(GFS_SHEET_NAME);
    sheet.appendRow([
      'Timestamp','Quote Ref','Company','Mode',
      'Single Adult Members','Family Members','Additional Children',
      'Dependants ≤70','Dependants 71-80','Cash Benefit Included',
      'Annual Salary Bill (MWK)','Package Selected','Rate Card Only',
      'Selected Monthly Premium (MWK)','Selected Annual Premium (MWK)',
      'Commencement','Prepared By','Benefits JSON','Status',
      'Prepared By (username)','Acting FA (username)',
    ]);
  }
  return sheet;
}

function saveQuoteGFS(p) {
  const sheet = getGFSSheet();
  const d = p.data ? JSON.parse(decodeURIComponent(p.data)) : p;
  const tierLabels = {std:'Standard', exe:'Executive', vip:'VIP', all:'All (comparison only)', custom:'Custom Cover Options'};
  const row = [
    new Date().toISOString(),
    d.ref             || '',
    d.company         || '',
    d.mode            || 'fast',
    d.n_single        || 0,
    d.n_family        || 0,
    d.n_extra_ch      || 0,
    d.n_dep_u70       || 0,
    d.n_dep_o70       || 0,
    d.inc_cash ? 'Yes' : 'No',
    d.sal_bill        || 0,
    tierLabels[d.package_tier] || 'Executive',
    d.rate_card_only ? 'Yes' : 'No',
    d.exe_monthly     || 0,
    d.exe_annual      || 0,
    d.date            || '',
    d.prepBy          || '',
    d.results         || '{}',
    'Active',
    d.preparedByUsername || '',
    d.actingFAUsername   || '',
  ];
  // Dedup by Quote Ref: update existing row in place rather than appending
  const ref = String(d.ref||'').trim();
  let targetRow = 0, updated = false;
  if (ref && sheet.getLastRow() > 1) {
    const refs = sheet.getRange(2, 2, sheet.getLastRow()-1, 1).getValues();
    for (var i = 0; i < refs.length; i++) {
      if (String(refs[i][0]).trim() === ref) { targetRow = i + 2; break; }
    }
  }
  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    updated = true;
  } else {
    sheet.appendRow(row);
    targetRow = sheet.getLastRow();
  }
  sheet.getRange(targetRow, 11, 1, 1).setNumberFormat('#,##0');  // Salary Bill
  sheet.getRange(targetRow, 14, 1, 2).setNumberFormat('#,##0');  // Selected Monthly/Annual Premium
  return { status:'ok', updated: updated,
    message: updated ? 'GFS quote updated (ref exists — no duplicate created)' : 'GFS quote saved',
    ref: ref || row[0], row: targetRow };
}

/* ── GCL Quotes — separate sheet tab ─────────────────────────────────── */
const GCL_SHEET_NAME = 'GCL Quotes';

function getGCLSheet() {
  const ss = SHEET_ID
    ? SpreadsheetApp.openById(SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GCL_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(GCL_SHEET_NAME);
    sheet.appendRow([
      'Timestamp','Quote Ref','Lender','Mode','Borrowers',
      'Average Loan (MWK)','Total Loan Book (MWK)','Average Term (months)','Average Age',
      'CI Rider','Hospitalisation Rider','Funeral Rider','Retrenchment Rider',
      'Single Premium (MWK)','Rate on Loan Book (%)',
      'Commencement','Prepared By','Benefits JSON','Status',
      'Prepared By (username)','Acting FA (username)',
    ]);
  }
  return sheet;
}

function saveQuoteGCL(p) {
  const sheet = getGCLSheet();
  const d = p.data ? JSON.parse(decodeURIComponent(p.data)) : p;
  const row = [
    new Date().toISOString(),
    d.ref            || '',
    d.company        || '',
    d.mode           || 'fast',
    d.n              || 0,
    d.avg_loan       || 0,
    d.total_loan     || 0,
    d.avg_term       || 0,
    d.avg_age        || 0,
    d.inc_ci   ? 'Yes' : 'No',
    d.inc_hosp ? 'Yes' : 'No',
    d.inc_fun  ? 'Yes' : 'No',
    d.inc_ret  ? 'Yes' : 'No',
    d.total_pa       || 0,
    d.rate_pct       || 0,
    d.date           || '',
    d.prepBy         || '',
    d.results        || '{}',
    'Active',
    d.preparedByUsername || '',
    d.actingFAUsername   || '',
  ];
  // Dedup by Quote Ref: update existing row in place rather than appending
  const ref = String(d.ref||'').trim();
  let targetRow = 0, updated = false;
  if (ref && sheet.getLastRow() > 1) {
    const refs = sheet.getRange(2, 2, sheet.getLastRow()-1, 1).getValues();
    for (var i = 0; i < refs.length; i++) {
      if (String(refs[i][0]).trim() === ref) { targetRow = i + 2; break; }
    }
  }
  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    updated = true;
  } else {
    sheet.appendRow(row);
    targetRow = sheet.getLastRow();
  }
  sheet.getRange(targetRow, 6, 1, 2).setNumberFormat('#,##0');
  sheet.getRange(targetRow, 14).setNumberFormat('#,##0');
  sheet.getRange(targetRow, 15).setNumberFormat('0.000');
  return { status:'ok', updated: updated,
    message: updated ? 'GCL quote updated (ref exists — no duplicate created)' : 'GCL quote saved',
    ref: ref || row[0], row: targetRow };
}

/* ── RET Quotes — separate sheet tab ─────────────────────────────────── */
// [PATCH A]
const RET_SHEET_NAME = 'RET Quotes';

function getRETSheet() {
  const ss = SHEET_ID
    ? SpreadsheetApp.openById(SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(RET_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(RET_SHEET_NAME);
    sheet.appendRow([
      'Timestamp','Quote Ref','Lender','Payment Mode','Borrowers',
      'Average Loan (MWK)','Total Loan Book (MWK)','Average Term (months)','Average Instalment (MWK)',
      'Abscondence Rider','Headline Premium (MWK)','Rate on Loan Book (%)',
      'Commencement','Prepared By','Benefits JSON','Status',
      'Prepared By (username)','Acting FA (username)',
    ]);
    sheet.getRange(1,1,1,18).setBackground('#641414').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function saveQuoteRET(p) {
  const sheet = getRETSheet();
  const d = p.data ? JSON.parse(decodeURIComponent(p.data)) : p;
  const row = [
    new Date().toISOString(),
    d.ref            || '',
    d.company        || '',
    d.payment_mode   || d.mode || 'oncoff',
    d.n              || 0,
    d.avg_loan       || 0,
    d.total_loan     || 0,
    d.avg_term       || 0,
    d.avg_instalment || 0,
    d.inc_abs  ? 'Yes' : 'No',
    d.total_pa       || 0,
    d.rate_pct       || 0,
    d.date           || '',
    d.prepBy         || '',
    d.results        || '{}',
    'Active',
    d.preparedByUsername || '',
    d.actingFAUsername   || '',
  ];
  // Dedup by Quote Ref: update existing row in place rather than appending
  const ref = String(d.ref||'').trim();
  let targetRow = 0, updated = false;
  if (ref && sheet.getLastRow() > 1) {
    const refs = sheet.getRange(2, 2, sheet.getLastRow()-1, 1).getValues();
    for (var i = 0; i < refs.length; i++) {
      if (String(refs[i][0]).trim() === ref) { targetRow = i + 2; break; }
    }
  }
  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    updated = true;
  } else {
    sheet.appendRow(row);
    targetRow = sheet.getLastRow();
  }
  sheet.getRange(targetRow, 6, 1, 3).setNumberFormat('#,##0');   // avg loan / total loan / avg term
  sheet.getRange(targetRow, 9, 1, 1).setNumberFormat('#,##0');   // avg instalment
  sheet.getRange(targetRow, 11).setNumberFormat('#,##0');        // headline premium
  sheet.getRange(targetRow, 12).setNumberFormat('0.000');        // rate %
  return { status:'ok', updated: updated,
    message: updated ? 'RET quote updated (ref exists — no duplicate created)' : 'RET quote saved',
    ref: ref || row[0], row: targetRow };
}

// Shared rights filter — fa sees only quotes they prepared, uploaded, or
// were the acting FA for (matched by username, never display name); ts
// and admin see everything, including full revise/find ability across
// every FA's quotes. Same pattern as getPdfArchive, applied consistently
// to every product's quote history now that all sheets track a
// reliable username rather than a free-text "Prepared By" display string.
function filterQuotesByRole(rows, session) {
  if (!session || session.role !== 'fa') return rows;
  const me = (session.username || '').toLowerCase();
  return rows.filter(function(r) {
    return (r.preparedByUsername||'').toLowerCase() === me
        || (r.actingFAUsername||'').toLowerCase()   === me;
  });
}

function getQuotes(p) {
  const ss = getSheet();
  const lastRow = ss.getLastRow();
  if (lastRow < 2) return { status:'ok', quotes:[] };
  const limit    = Math.min(parseInt(p.limit || '30'), 100);
  const startRow = Math.max(2, lastRow - limit + 1);
  const numRows  = lastRow - startRow + 1;
  const data     = ss.getRange(startRow, 1, numRows, 16).getValues();
  let quotes   = data.reverse().map(function(row) {
    return {
      savedAt:row[0], ref:row[1], company:row[2], mode:row[3],
      nMembers:row[4], payroll:row[5], multiple:row[6],
      annualPremium:row[7], date:row[8], sector:row[9],
      prepBy:row[10], benefits:row[11]?tryParse(row[11]):{}, status:row[12],
      hasFullData:!!(row[13]),   // true when fullData JSON was saved
      preparedByUsername:row[14]||'', actingFAUsername:row[15]||'',
      product:'gla',
    };
  });
  quotes = filterQuotesByRole(quotes, p.session);
  return { status:'ok', quotes, count:quotes.length };
}

// Unified fetch across all five product sheets (GLA/GFC/GFS/GCL/RET),
// each normalized into the same shape History already expects —
// company, ref, mode, a headline annualPremium figure, and a savedAt
// timestamp — with an explicit product tag rather than relying on the
// client guessing product from a ref prefix. Rights-filtered once,
// consistently, rather than separate ad-hoc filters per product.
function getAllQuotes(p) {
  const limit = Math.min(parseInt(p.limit || '100'), 300);
  const out = [];

  // GLA
  try {
    const ss = getSheet();
    const lastRow = ss.getLastRow();
    if (lastRow >= 2) {
      const numRows = Math.min(limit, lastRow - 1);
      const data = ss.getRange(Math.max(2, lastRow-numRows+1), 1, numRows, 16).getValues();
      data.forEach(function(row) {
        out.push({ product:'gla', savedAt:row[0], ref:row[1], company:row[2], mode:row[3],
          nMembers:row[4], payroll:row[5], multiple:row[6], annualPremium:row[7],
          date:row[8], sector:row[9], prepBy:row[10], status:row[12],
          hasFullData:!!row[13], preparedByUsername:row[14]||'', actingFAUsername:row[15]||'' });
      });
    }
  } catch(e) {}

  // GFC
  try {
    const ss = getGFCSheet();
    const lastRow = ss.getLastRow();
    if (lastRow >= 2) {
      const numRows = Math.min(limit, lastRow - 1);
      const data = ss.getRange(Math.max(2, lastRow-numRows+1), 1, numRows, 18).getValues();
      data.forEach(function(row) {
        out.push({ product:'gfc', savedAt:row[0], ref:row[1], company:row[2], mode:row[3],
          nMembers:row[4], annualPremium:row[11], date:row[12], prepBy:row[13],
          hasFullData:false, preparedByUsername:row[16]||'', actingFAUsername:row[17]||'' });
      });
    }
  } catch(e) {}

  // GFS
  try {
    const ss = getGFSSheet();
    const lastRow = ss.getLastRow();
    if (lastRow >= 2) {
      const numRows = Math.min(limit, lastRow - 1);
      const data = ss.getRange(Math.max(2, lastRow-numRows+1), 1, numRows, 21).getValues();
      data.forEach(function(row) {
        out.push({ product:'gfs', savedAt:row[0], ref:row[1], company:row[2], mode:row[3],
          nMembers:(row[4]||0)+(row[5]||0), annualPremium:row[14], date:row[15], prepBy:row[16],
          hasFullData:false, preparedByUsername:row[19]||'', actingFAUsername:row[20]||'' });
      });
    }
  } catch(e) {}

  // GCL
  try {
    const ss = getGCLSheet();
    const lastRow = ss.getLastRow();
    if (lastRow >= 2) {
      const numRows = Math.min(limit, lastRow - 1);
      const data = ss.getRange(Math.max(2, lastRow-numRows+1), 1, numRows, 21).getValues();
      data.forEach(function(row) {
        out.push({ product:'gcl', savedAt:row[0], ref:row[1], company:row[2], mode:row[3],
          nMembers:row[4], annualPremium:row[13], date:row[15], prepBy:row[16],
          hasFullData:false, preparedByUsername:row[19]||'', actingFAUsername:row[20]||'' });
      });
    }
  } catch(e) {}

  // RET [PATCH A]
  try {
    const ss = getRETSheet();
    const lastRow = ss.getLastRow();
    if (lastRow >= 2) {
      const numRows = Math.min(limit, lastRow - 1);
      const data = ss.getRange(Math.max(2, lastRow-numRows+1), 1, numRows, 18).getValues();
      data.forEach(function(row) {
        out.push({ product:'ret', savedAt:row[0], ref:row[1], company:row[2], mode:row[3],
          nMembers:row[4], annualPremium:row[10], date:row[12], prepBy:row[13],
          hasFullData:false, preparedByUsername:row[16]||'', actingFAUsername:row[17]||'' });
      });
    }
  } catch(e) {}

  out.sort(function(a,b){ return new Date(b.savedAt) - new Date(a.savedAt); });
  const filtered = filterQuotesByRole(out, p.session);
  return { status:'ok', quotes: filtered.slice(0, limit), count: filtered.length };
}

// Fetch a single quote by ref, returning the stored fullData JSON for cross-device restore
function getQuote(p) {
  const ref = (p.ref || '').trim();
  if (!ref) return { status:'error', message:'No ref provided' };
  const ss = getSheet();
  const lastRow = ss.getLastRow();
  if (lastRow < 2) return { status:'error', message:'No quotes found' };
  const data = ss.getRange(2, 1, lastRow - 1, 14).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    if ((data[i][1] || '').toString().trim() === ref) {
      const fullDataStr = data[i][13];
      if (!fullDataStr) return { status:'error', message:'Full data not available — re-save from originating device.' };
      try {
        const fullData = JSON.parse(fullDataStr);
        return { status:'ok', ref: ref, fullData: fullData };
      } catch(e) {
        return { status:'error', message:'Could not parse stored data.' };
      }
    }
  }
  return { status:'error', message:'Quote ref not found in sheet.' };
}

function tryParse(str) {
  try { return JSON.parse(str); } catch(e) { return {}; }
}

function deleteQuote(p) {
  // Admin-only — matches the client UI, which only shows the Delete button
  // to admins. Previously unchecked here, so any authenticated user could
  // delete any quote by calling this action directly.
  if (!p.session || p.session.role !== 'admin') {
    return { status:'error', message:'Only administrators can delete quotes.' };
  }
  if (!p.ref) return { status:'error', message:'No ref provided' };
  const ss   = getSheet();
  const data = ss.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === p.ref) {
      ss.deleteRow(i + 1);
      return { status:'ok', message:'Quote deleted', ref:p.ref };
    }
  }
  return { status:'error', message:'Quote not found: ' + p.ref };
}

// ── AUTHENTICATION ───────────────────────────────────────────────
// Users live in their own Sheet tab, never in the client. Passwords are
// stored as salted SHA-256 hashes — never in plaintext, and never sent
// back to the client (getUsersList strips the hash/salt before returning).
const USERS_SHEET_NAME = 'GLA Users';

function hashPassword(pwd, salt) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + ':' + pwd, Utilities.Charset.UTF_8
  );
  return raw.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function makeSalt() {
  return Utilities.getUuid().replace(/-/g, '');
}

function getUsersSheet() {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
    const headers = ['Username','FullName','Email','Role','Salt','PwdHash','CreatedAt','Title'];
    sheet.appendRow(headers);
    sheet.getRange(1,1,1,headers.length).setBackground('#641414').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Bootstrap a default admin so the deployment is usable immediately.
    // Change this password via the Manage Users screen after first login.
    const salt = makeSalt();
    sheet.appendRow(['admin', 'VLA Administrator', 'admin@vanguardlifemw.com', 'admin',
                      salt, hashPassword('vla2026', salt), new Date().toISOString(), 'Administrator']);
  }
  return sheet;
}

function readAllUsers() {
  const sheet = getUsersSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  return data.map(function(row, i) {
    return { row: i + 2, username: row[0], fullName: row[1], email: row[2],
             role: row[3], salt: row[4], pwdHash: row[5], createdAt: row[6],
             title: row[7] || '' };
  }).filter(u => u.username);
}

function login(p) {
  const uname = (p.username || '').trim();
  const pwd = p.password || '';
  if (!uname || !pwd) return { status:'error', message:'Username and password are required.' };
  const users = readAllUsers();
  const user = users.find(u => u.username.toLowerCase() === uname.toLowerCase());
  if (!user) return { status:'error', message:'Incorrect username or password.' };
  const candidateHash = hashPassword(pwd, user.salt);
  if (candidateHash !== user.pwdHash) return { status:'error', message:'Incorrect username or password.' };
  // One-time migration: legacy 'agent' role becomes 'ts' (Technical Services)
  if (user.role === 'agent') {
    getUsersSheet().getRange(user.row, 4).setValue('ts');
    user.role = 'ts';
  }
  const token = createToken(user.username, user.role);
  return {
    status:'ok',
    token: token,
    user: { username: user.username, fullName: user.fullName, email: user.email, role: user.role, title: user.title||'' },
  };
}

// Returns the user list WITHOUT password hashes/salts — safe for the
// Manage Users screen, which only needs username/fullName/email/role.
function getUsersList(p) {
  // admin: Manage Users screen. ts: the "Quote on Behalf of" FA dropdown
  // also calls this action, so ts must stay allowed. fa is not.
  if (!p.session || (p.session.role !== 'admin' && p.session.role !== 'ts')) {
    return { status:'error', message:'Not authorized.' };
  }
  const users = readAllUsers();
  return {
    status:'ok',
    users: users.map(u => ({ username:u.username, fullName:u.fullName, email:u.email, role:u.role, title:u.title||'' })),
  };
}

// Create or update a user. If `password` is omitted on an update, the
// existing hash is preserved (matches the "blank = keep current" UX).
function saveUser(p) {
  // Admin-only — creates/updates accounts, including granting the 'admin'
  // role itself. Previously unchecked, so any authenticated user could
  // create themselves a new admin account.
  if (!p.session || p.session.role !== 'admin') {
    return { status:'error', message:'Only administrators can create or update users.' };
  }
  const uname = (p.username || '').trim();
  const editKey = (p.editKey || '').trim();
  const fullName = (p.fullName || '').trim();
  const email = (p.email || '').trim();
  const role = ['admin','ts','fa'].includes(p.role) ? p.role : 'ts';
  const title = (p.title || '').trim();
  const pwd = p.password || '';
  if (!uname) return { status:'error', message:'Username is required.' };
  if (!fullName) return { status:'error', message:'Full name is required.' };
  if (!editKey && !pwd) return { status:'error', message:'Password is required for new users.' };

  const sheet = getUsersSheet();
  const users = readAllUsers();
  const existingByUname = users.find(u => u.username.toLowerCase() === uname.toLowerCase());

  if (editKey) {
    const target = users.find(u => u.username.toLowerCase() === editKey.toLowerCase());
    if (!target) return { status:'error', message:'User not found: ' + editKey };
    if (uname.toLowerCase() !== editKey.toLowerCase() && existingByUname) {
      return { status:'error', message:'Username already exists.' };
    }
    const salt = pwd ? makeSalt() : target.salt;
    const pwdHash = pwd ? hashPassword(pwd, salt) : target.pwdHash;
    sheet.getRange(target.row, 1, 1, 6).setValues([[uname, fullName, email, role, salt, pwdHash]]);
    sheet.getRange(target.row, 8).setValue(title);
    return { status:'ok', message:'User updated.' };
  }

  // Creating a new user
  if (existingByUname) return { status:'error', message:'Username already exists.' };
  const salt = makeSalt();
  sheet.appendRow([uname, fullName, email, role, salt, hashPassword(pwd, salt), new Date().toISOString(), title]);
  return { status:'ok', message:'User created.' };
}

function deleteUser(p) {
  // Admin-only — previously unchecked, so any authenticated user could
  // delete any other user's account via this action.
  if (!p.session || p.session.role !== 'admin') {
    return { status:'error', message:'Only administrators can delete users.' };
  }
  const uname = (p.username || '').trim();
  if (!uname) return { status:'error', message:'No username provided.' };
  const sheet = getUsersSheet();
  const users = readAllUsers();
  const target = users.find(u => u.username.toLowerCase() === uname.toLowerCase());
  if (!target) return { status:'error', message:'User not found: ' + uname };
  // Refuse to delete the last remaining admin so the system never locks out.
  const admins = users.filter(u => u.role === 'admin');
  if (target.role === 'admin' && admins.length <= 1) {
    return { status:'error', message:'Cannot delete the last remaining administrator.' };
  }
  sheet.deleteRow(target.row);
  return { status:'ok', message:'User deleted.' };
}

// ── SESSION TOKENS ───────────────────────────────────────────────
// Token-based auth: the password travels once, at login. Every other
// action carries a short-lived token instead. Tokens live in their own
// sheet tab so they survive across executions (Apps Script has no
// shared server-side memory between requests).
const TOKENS_SHEET_NAME = 'GLA Tokens';
const TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours

function getTokensSheet() {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TOKENS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TOKENS_SHEET_NAME);
    const headers = ['Token','Username','Role','Created','Expires'];
    sheet.appendRow(headers);
    sheet.getRange(1,1,1,headers.length).setBackground('#641414').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'vla_' + suffix;
}

function createToken(username, role) {
  const sheet = getTokensSheet();
  const token = generateToken();
  const now = new Date();
  const expires = new Date(now.getTime() + TOKEN_LIFETIME_MS);
  sheet.appendRow([token, username, role, now.toISOString(), expires.toISOString()]);
  return token;
}

function validateToken(token) {
  if (!token) return { valid: false };
  const sheet = getTokensSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { valid: false };
  const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const now = new Date();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row[0] === token) {
      const expires = new Date(row[4]);
      if (expires < now) return { valid: false };
      return { valid: true, username: row[1], role: row[2] };
    }
  }
  return { valid: false };
}

// Deletes all expired rows from the Tokens sheet. Attach this to a
// daily time-based trigger in Apps Script (Triggers > Add Trigger >
// purgeExpiredTokens > Time-driven) so the sheet doesn't grow unbounded.
function purgeExpiredTokens() {
  const sheet = getTokensSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const now = new Date();
  // Delete from the bottom up so row indices of earlier rows stay valid.
  for (let i = data.length - 1; i >= 0; i--) {
    const expires = new Date(data[i][4]);
    if (expires < now) sheet.deleteRow(i + 2);
  }
}

// ── HELPERS ──────────────────────────────────────────────────────
function ok(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss = SHEET_ID
    ? SpreadsheetApp.openById(SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeader(sheet) {
  if (sheet.getLastRow() !== 0) return;
  const headers = [
    'Timestamp','Quote Ref','Company','Mode','Members',
    'Payroll (MWK)','GLA Multiple','Annual Premium (MWK)',
    'Commencement','Sector','Prepared By','Benefits JSON','Status','Full Data JSON',
    'Prepared By (username)','Acting FA (username)',
  ];
  sheet.appendRow(headers);
  const hr = sheet.getRange(1, 1, 1, headers.length);
  hr.setBackground('#641414').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 130);
  sheet.setColumnWidth(3, 220);
}

/**
 * ── DEPLOYMENT INSTRUCTIONS ──────────────────────────────────────
 *
 * 1. script.google.com → New Project → paste this file
 * 2. Set SHEET_ID on line 17 (copy ID from your Google Sheet URL)
 * 3. Deploy → New Deployment
 *    Type: Web App | Execute as: Me | Access: Anyone
 * 4. Copy /exec URL → paste into VLA GLA App → Admin Settings → GAS URL → Test
 *
 * To update assumptions or rates:
 *   Edit the constants above → Deploy → MANAGE DEPLOYMENTS (not New)
 *   → Edit existing → Save new version → same URL, updated engine
 *
 * To set up token auto-cleanup:
 *   Apps Script → Triggers → Add Trigger → purgeExpiredTokens
 *   → Time-driven → Day timer → any hour
 *
 * Endpoints:
 *   ?action=ping                        Health check + engine version      (open)
 *   ?action=login&username=&password=   Authenticate, receive token        (open)
 *   ?action=getConfig                   Sectors / tiers / admin defaults   (open)
 *   ?action=calc&q={...}&token=         Fast Quote                         (auth)
 *   ?action=calc&q={...}&members={...}&token=  Full Quote                  (auth)
 *   ?action=saveQuote&data={...}&token= Persist quote to Sheet             (auth)
 *   ?action=getQuotes&limit=30&token=   Fetch recent quotes                (auth)
 *   ?action=deleteQuote&ref=&token=     Delete quote row                   (auth)
 *   ?action=getUsers&token=             List users (no hashes)             (auth)
 *   ?action=saveUser&...&token=         Create or update user              (auth)
 *   ?action=deleteUser&username=&token= Delete user                        (auth)
 */

/* ═══════════════════════════════════════════════════════════════════
   GFC — GROUP FUNERAL COVER (STANDALONE CASH BENEFITS)
   Prices funeral benefits independent of any GLA cover.
   Uses the same mortality proxies as the GLA funeral rider.
═══════════════════════════════════════════════════════════════════ */

function runCalcGFC(p) {
  if (!p || !p.q) return { error: 'Missing parameters — call via HTTP GET with action and q params.' };
  let q;
  try { q = JSON.parse(decodeURIComponent(p.q)); } catch(e) { return { error: 'Invalid q parameter: ' + e.message }; }

  let   adm = readPersistedConfig();  // server-authoritative — includes any admin-saved overrides

  if (p.session && p.session.role === 'admin' && p.adm) {
    try {
      const ca = JSON.parse(decodeURIComponent(p.adm));
      Object.keys(ADM_DEF).forEach(function(k) {
        if (ca[k] !== undefined && typeof ca[k] === 'number') adm[k] = ca[k];
      });
    } catch(e) {}
  }

  // ── FULL QUOTE: per-member census ────────────────────────────────
  if (q.mode === 'full' && p.members) {
    const members = JSON.parse(decodeURIComponent(p.members));
    const breakdown = {member:0, spouse:0, child:0, parent:0};
    let total_net = 0;

    members.forEach(function(m) {
      const gen   = (m[0]||'M').toUpperCase();
      const age   = Math.min(Math.max(+m[1]||30, 16), 80);
      const spAge = Math.max(16, age - adm.gfc_spSetback);
      const parAge= Math.min(80, age + adm.gfc_parentOffset);
      const mb    = +q.f_mBen || 1000000;
      const nCh   = Math.min(+q.f_nCh||0, 4);
      const nPar  = Math.min(+q.f_nPar||0, 2);
      const cPct  = +q.f_cPct || 0.50;
      const pPct  = +q.f_pPct || 0.25;

      const pm = (mb / 1000) * ciR(age, gen) / adm.gfc_expDiv;
      breakdown.member += pm;
      total_net += pm;

      if (q.f_scope !== 'member_only') {
        const ps = (mb / 1000) * ciR(spAge, 'F') / adm.gfc_expDiv;
        breakdown.spouse += ps;
        total_net += ps;
      }
      if (q.f_scope !== 'member_only' && nCh > 0) {
        const pc = (mb * cPct * nCh / 1000) * adm.gfc_childMort;
        breakdown.child += pc;
        total_net += pc;
      }
      if (q.f_scope === 'member_family' && nPar > 0) {
        const pp = (mb * pPct * nPar / 1000) * ciR(parAge,'M') * adm.gfc_parentLoad / adm.gfc_expDiv;
        breakdown.parent += pp;
        total_net += pp;
      }
    });

    const total_gross = total_net / (1 - adm.gfc_commission);
    return {
      product:'gfc', mode:'full',
      n: members.length, avg_age: q.avg_age, f_mBen: +q.f_mBen,
      prem_per_member: total_gross / members.length,
      total_net: total_net, total_pa: total_gross,
      total_monthly: total_gross / 12,
      commission: total_gross - total_net,
      breakdown: breakdown,
      adm_used: {gfc_expDiv:adm.gfc_expDiv, gfc_commission:adm.gfc_commission},
    };
  }

  // ── FAST QUOTE: aggregate ─────────────────────────────────────────
  const {
    n, avg_age, pf, f_mBen, f_scope,
    f_nCh, f_nPar, f_cPct, f_pPct,
    use_tiers, tiers, sal_bill,
  } = q;

  const age   = +avg_age|| 35;
  const pfem  = +pf     || 0.40;
  const nCh   = Math.min(+f_nCh  || 0, 4);
  const nPar  = Math.min(+f_nPar || 0, 2);
  const cPct  = +f_cPct || 0.50;
  const pPct  = +f_pPct || 0.25;
  const spAge = Math.max(16, age - adm.gfc_spSetback);
  const parAge= Math.min(80, age + adm.gfc_parentOffset);

  // Helper: net premium per member for a given benefit amount
  function gfcNetPremPerMember(mb) {
    const ciBlend = (1 - pfem) * ciR(age,'M') + pfem * ciR(age,'F');
    let prem = (mb / 1000) * ciBlend / adm.gfc_expDiv;
    if (f_scope !== 'member_only') {
      prem += (mb / 1000) * ciR(spAge,'F') / adm.gfc_expDiv;
    }
    if (f_scope !== 'member_only' && nCh > 0) {
      prem += (mb * cPct * nCh / 1000) * adm.gfc_childMort;
    }
    if (f_scope === 'member_family' && nPar > 0) {
      prem += (mb * pPct * nPar / 1000) * ciR(parAge,'M') * adm.gfc_parentLoad / adm.gfc_expDiv;
    }
    return prem;
  }

  // ── TIERED pricing ─────────────────────────────────────────────
  if (use_tiers && Array.isArray(tiers) && tiers.length > 0) {
    var tierResults = [];
    var total_net_t = 0;
    var totalN_t = 0;
    tiers.forEach(function(tier) {
      var tN   = +tier.n || 0;
      var tBen = +tier.f_mBen || 1000000;
      var tNet = gfcNetPremPerMember(tBen) * tN;
      total_net_t += tNet;
      totalN_t    += tN;
      tierResults.push({ name: tier.name||'Tier', n: tN, f_mBen: tBen, tier_net: tNet,
        prem_per_member: tN > 0 ? tNet/tN : 0 });
    });
    var total_gross_t = total_net_t / (1 - adm.gfc_commission);
    return {
      product:'gfc', mode:'fast', use_tiers:true,
      n: totalN_t, avg_age: age, f_mBen: null, f_scope: f_scope,
      f_nCh: nCh, f_nPar: nPar,
      prem_per_member: totalN_t>0 ? total_gross_t/totalN_t : 0,
      total_net: total_net_t, total_pa: total_gross_t,
      total_monthly: total_gross_t / 12,
      commission: total_gross_t - total_net_t,
      tier_results: tierResults, sal_bill: +sal_bill||0,
      adm_used: {gfc_expDiv:adm.gfc_expDiv, gfc_commission:adm.gfc_commission},
    };
  }

  // ── UNIFORM pricing ────────────────────────────────────────────
  const N              = +n || 100;
  const mb             = +f_mBen || 1000000;
  const prem_per_m     = gfcNetPremPerMember(mb);
  const ciBlend2       = (1 - pfem) * ciR(age,'M') + pfem * ciR(age,'F');
  const p_member       = (mb/1000)*ciBlend2/adm.gfc_expDiv;
  const p_spouse       = f_scope!=='member_only'?(mb/1000)*ciR(spAge,'F')/adm.gfc_expDiv:0;
  const p_child        = (f_scope!=='member_only'&&nCh>0)?(mb*cPct*nCh/1000)*adm.gfc_childMort:0;
  const p_parent       = (f_scope==='member_family'&&nPar>0)?(mb*pPct*nPar/1000)*ciR(parAge,'M')*adm.gfc_parentLoad/adm.gfc_expDiv:0;
  const total_net      = prem_per_m * N;
  const total_gross    = total_net / (1 - adm.gfc_commission);

  // Benefit schedule (for PDF output)
  const benefits = [
    {life:'Member',          n:1,    benefit:mb},
    {life:'Spouse',          n:f_scope!=='member_only'?1:0,    benefit:mb},
    {life:'Child (per child)',n:nCh,  benefit:Math.round(mb*cPct)},
    {life:'Parent (per parent)',n:nPar, benefit:Math.round(mb*pPct)},
  ].filter(function(r){return r.n>0;});

  return {
    product:        'gfc',
    mode:           'fast',
    use_tiers:      false,
    n:              N,
    avg_age:        age,
    f_mBen:         mb,
    f_scope:        f_scope,
    f_nCh:          nCh,
    f_nPar:         nPar,
    prem_per_member:prem_per_m,
    total_net:      total_net,
    total_pa:       total_gross,
    total_monthly:  total_gross / 12,
    commission:     total_gross - total_net,
    breakdown:{
      member:  p_member  * N,
      spouse:  p_spouse  * N,
      child:   p_child   * N,
      parent:  p_parent  * N,
    },
    sal_bill:       +sal_bill||0,
    adm_used:       {gfc_expDiv:adm.gfc_expDiv, gfc_commission:adm.gfc_commission},
  };
}

/* ═══════════════════════════════════════════════════════════════════
   GFS — GROUP FUNERAL SERVICES (PACKAGE-BASED)
   Returns premiums for all three tiers so the quote letter can show
   a comparison table. Admin configures package premiums in ADM_DEF.
═══════════════════════════════════════════════════════════════════ */

function runCalcGFS(p) {
  if (!p || !p.q) return { error: 'Missing parameters — call via HTTP GET with action and q params.' };
  let q;
  try { q = JSON.parse(decodeURIComponent(p.q)); } catch(e) { return { error: 'Invalid q parameter: ' + e.message }; }

  let   adm = readPersistedConfig();  // server-authoritative — includes any admin-saved overrides

  if (p.session && p.session.role === 'admin' && p.adm) {
    try {
      const ca = JSON.parse(decodeURIComponent(p.adm));
      Object.keys(ADM_DEF).forEach(function(k) {
        if (ca[k] !== undefined && typeof ca[k] === 'number') adm[k] = ca[k];
      });
    } catch(e) {}
  }

  const {
    n_single,    // single adult members (member + up to 4 children)
    n_family,    // family members (member + spouse + up to 4 children)
    n_extra_ch,  // additional children above the standard 4
    n_dep_u70,   // dependants aged up to 70
    n_dep_o70,   // dependants aged 71–80
    inc_cash,    // include optional MWK 1M cash benefit
    inc_transport, // include mourners transport in cash-in-lieu
  } = q;

  const nS  = +n_single    || 0;
  const nF  = +n_family    || 0;
  const nEC = +n_extra_ch  || 0;
  const nD1 = +n_dep_u70   || 0;
  const nD2 = +n_dep_o70   || 0;
  const N   = nS + nF;

  function tierPremiums(tier) {
    // Monthly base premiums
    const base = (nS  * adm['gfs_single_'+tier])
               + (nF  * adm['gfs_family_'+tier])
               + (nEC * adm['gfs_child_'+tier])
               + (nD1 * adm['gfs_dep70_'+tier])
               + (nD2 * adm['gfs_dep80_'+tier]);

    // Optional cash benefit
    const cash = inc_cash
      ? (nS  * adm.gfs_cash_single)
      + (nF  * adm.gfs_cash_family)
      + (nEC * adm.gfs_cash_child)
      + ((nD1+nD2) * adm.gfs_cash_dep)
      : 0;

    const monthly_net  = base + cash;
    const monthly_gross = monthly_net / (1 - adm.gfs_commission);
    const annual_gross  = monthly_gross * 12;

    // Cash-in-lieu value (informational — not a premium)
    const lieu_services  = adm['gfs_lieu_'+tier];
    const lieu_transport = lieu_services + adm.gfs_lieu_transport;

    return {
      monthly_net:     monthly_net,
      monthly_gross:   monthly_gross,
      annual_gross:    annual_gross,
      per_member_monthly: N > 0 ? monthly_gross / N : 0,
      lieu_services:   lieu_services,
      lieu_transport:  lieu_transport,
      cash_benefit:    inc_cash ? adm.gfs_cash_benefit : 0,
    };
  }

  const tiers = {
    std: tierPremiums('std'),
    exe: tierPremiums('exe'),
    vip: tierPremiums('vip'),
  };

  // Rate card — per-unit monthly premium for each member type and tier,
  // independent of any headcount. Used for "package options only" quotes
  // where the client hasn't yet supplied member numbers.
  function unitRate(tier, key) {
    return adm['gfs_'+key+'_'+tier] / (1 - adm.gfs_commission);
  }
  const rate_card = {};
  ['std','exe','vip'].forEach(function(tier){
    rate_card[tier] = {
      single: unitRate(tier,'single'),
      family: unitRate(tier,'family'),
      child:  unitRate(tier,'child'),
      dep70:  unitRate(tier,'dep70'),
      dep80:  unitRate(tier,'dep80'),
      cash_single: inc_cash ? adm.gfs_cash_single/(1-adm.gfs_commission) : 0,
      cash_family: inc_cash ? adm.gfs_cash_family/(1-adm.gfs_commission) : 0,
      cash_child:  inc_cash ? adm.gfs_cash_child/(1-adm.gfs_commission) : 0,
      cash_dep:    inc_cash ? adm.gfs_cash_dep/(1-adm.gfs_commission) : 0,
      lieu_services: adm['gfs_lieu_'+tier],
      lieu_transport: adm['gfs_lieu_'+tier] + adm.gfs_lieu_transport,
    };
  });

  // ── CUSTOM COVER OPTIONS ────────────────────────────────────────
  // For clients wanting a specific cash-in-lieu cover amount rather than
  // a fixed package tier (e.g. "MWK 4M for corporate, MWK 1M for
  // dependants"). Uses the same per-MWK rates as the Optional Cash
  // Benefit rider (gfs_cash_single/family/dep), which are already
  // flat across all three package tiers in the published rate card —
  // so this is a direct extrapolation of an existing, tier-independent
  // rate rather than a new pricing basis. Transport is treated as
  // embedded in the cover amount (no separate transport line, unlike
  // the package "lieu of services" tables above).
  let custom_cover_options = null;
  if (q.custom_corp_covers || q.custom_dep_covers) {
    const rateFamily = adm.gfs_cash_family / adm.gfs_cash_benefit;
    const rateSingle = adm.gfs_cash_single / adm.gfs_cash_benefit;
    const rateDep     = adm.gfs_cash_dep    / adm.gfs_cash_benefit;
    const corpCovers = Array.isArray(q.custom_corp_covers) ? q.custom_corp_covers : [];
    const depCovers  = Array.isArray(q.custom_dep_covers)  ? q.custom_dep_covers  : [];
    custom_cover_options = {
      corporate: corpCovers.map(function(cover) {
        return {
          cover: cover,
          family_monthly: (cover * rateFamily) / (1 - adm.gfs_commission),
          single_monthly: (cover * rateSingle) / (1 - adm.gfs_commission),
        };
      }),
      dependent: depCovers.map(function(cover) {
        return {
          cover: cover,
          monthly: (cover * rateDep) / (1 - adm.gfs_commission),
        };
      }),
    };
  }

  return {
    product:   'gfs',
    rate_card: rate_card,
    custom_cover_options: custom_cover_options,
    n:         N,
    n_single:  nS,
    n_family:  nF,
    n_dep_u70: nD1,
    n_dep_o70: nD2,
    inc_cash:  !!inc_cash,
    tiers:     tiers,
    total_pa:  tiers.exe.annual_gross,   // executive tier as headline figure
    adm_used:  {gfs_commission:adm.gfs_commission},
  };
}

/* ═══════════════════════════════════════════════════════════════════
   GCL — GROUP CREDIT LIFE
   Single premium = max(annual_rate × loan × term/12,  min_rate × loan)
   Riders add on top. Output shows % of loan book as headline rate.
═══════════════════════════════════════════════════════════════════ */

function runCalcGCL(p) {
  if (!p || !p.q) return { error: 'Missing parameters — call via HTTP GET with action and q params.' };
  let q;
  try { q = JSON.parse(decodeURIComponent(p.q)); } catch(e) { return { error: 'Invalid q parameter: ' + e.message }; }

  let   adm = readPersistedConfig();  // server-authoritative — includes any admin-saved overrides

  if (p.session && p.session.role === 'admin' && p.adm) {
    try {
      const ca = JSON.parse(decodeURIComponent(p.adm));
      Object.keys(ADM_DEF).forEach(function(k) {
        if (ca[k] !== undefined && typeof ca[k] === 'number') adm[k] = ca[k];
      });
    } catch(e) {}
  }

  const {
    company,
    n,           // number of borrowers
    avg_loan,    // average loan amount (MWK)
    total_loan,  // total estimated loan book (MWK); if absent, n × avg_loan
    avg_term,    // average loan term (months)
    avg_age,     // average borrower age
    inc_ci,      // critical illness rider
    inc_hosp,    // hospitalisation rider
    inc_fun,     // funeral cash benefit rider
    inc_ret,     // retrenchment rider
  } = q;

  const N      = +n        || 100;
  const aLoan  = +avg_loan || 1000000;
  const tLoan  = +total_loan || (N * aLoan);
  const term   = Math.min(+avg_term || 36, adm.gcl_maxTerm);
  const age    = Math.min(+avg_age  || 35, adm.gcl_maxAge);

  // ── Core premium per loan ──────────────────────────────────────
  const singlePrem = adm.gcl_baseRate * aLoan * (term / 12);
  const minPrem    = adm.gcl_minRate  * aLoan;
  const basePrem   = Math.max(singlePrem, minPrem);

  // ── Riders (per member) ────────────────────────────────────────
  const ciPrem   = inc_ci   ? basePrem * adm.gcl_ciRiderPct / adm.gcl_baseRate : 0;
  // Hospitalisation: flat annual cost per member (converted to single prem equiv)
  const hospPrem = inc_hosp ? adm.gcl_hospPa * (term / 12) : 0;
  // Funeral cash: priced off mortality proxy for borrower + 1 spouse + 2 children
  const funMort  = ciR(age,'M') / (1 + ADM_DEF.ciLoad_fast);
  const funPrem  = inc_fun
    ? (adm.gcl_funBorrower + adm.gcl_funSpouse + 2 * adm.gcl_funChild)
      / 1000 * funMort * (term / 12)
    : 0;
  // Retrenchment rider (simple loading — detailed retrenchment pricing in RET product)
  const retPrem  = inc_ret  ? basePrem * ADM_DEF.ret_rateMonthly * 4 : 0;

  const totalPerMember = basePrem + ciPrem + hospPrem + funPrem + retPrem;
  const totalNet       = totalPerMember * N;
  const totalGross     = totalNet / (1 - adm.gcl_commission);
  const ratePct        = tLoan > 0 ? (totalGross / tLoan) * 100 : 0;

  return {
    product:      'gcl',
    n:            N,
    avg_loan:     aLoan,
    total_loan:   tLoan,
    avg_term:     term,
    avg_age:      age,
    per_member:   totalPerMember,
    total_net:    totalNet,
    total_pa:     totalGross,      // single premium (upfront)
    rate_pct:     ratePct,         // % of total loan book
    monthly_equiv:totalGross / term, // monthly collection equivalent
    breakdown: {
      base:  basePrem  * N,
      ci:    ciPrem    * N,
      hosp:  hospPrem  * N,
      fun:   funPrem   * N,
      ret:   retPrem   * N,
    },
    adm_used: {
      gcl_baseRate:adm.gcl_baseRate, gcl_minRate:adm.gcl_minRate,
      gcl_commission:adm.gcl_commission,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════
   RET — RETRENCHMENT + ABSCONDENCE (STANDALONE)
   Single premium = rate_per_month × loan × term_months
   Returns both once-off and monthly collection equivalents.
   Abscondence is an optional add-on rider.
═══════════════════════════════════════════════════════════════════ */

function runCalcRET(p) {
  if (!p || !p.q) return { error: 'Missing parameters — call via HTTP GET with action and q params.' };
  let q;
  try { q = JSON.parse(decodeURIComponent(p.q)); } catch(e) { return { error: 'Invalid q parameter: ' + e.message }; }

  let   adm = readPersistedConfig();  // server-authoritative — includes any admin-saved overrides

  if (p.session && p.session.role === 'admin' && p.adm) {
    try {
      const ca = JSON.parse(decodeURIComponent(p.adm));
      Object.keys(ADM_DEF).forEach(function(k) {
        if (ca[k] !== undefined && typeof ca[k] === 'number') adm[k] = ca[k];
      });
    } catch(e) {}
  }

  const {
    n,            // number of borrowers
    avg_loan,     // average loan amount (MWK)
    total_loan,   // total estimated loan book (MWK)
    avg_term,     // average loan term (months)
    avg_instalment, // average monthly instalment (MWK); if absent estimated
    inc_abs,      // include abscondence rider
    payment_mode, // 'oncoff' | 'monthly'
  } = q;

  const N      = +n          || 100;
  const aLoan  = +avg_loan   || 1000000;
  const tLoan  = +total_loan || (N * aLoan);
  const term   = Math.min(+avg_term || 36, adm.ret_maxTerm);

  // Estimated average monthly instalment (simple approximation, ignoring interest)
  const estInst = +avg_instalment > 0 ? +avg_instalment : aLoan / term;

  // ── Single premium per loan ──────────────────────────────────
  const retRate  = adm.ret_rateMonthly;                           // e.g. 0.0024
  const absRate  = inc_abs ? adm.ret_absRateMonthly : 0;         // e.g. 0.0016
  const combRate = retRate + absRate;

  const singlePerLoan  = combRate * aLoan * term;                 // once-off
  const monthlyPerLoan = singlePerLoan / term;                    // monthly equiv

  // Gross up for commission
  const singleNetTotal   = singlePerLoan  * N;
  const singleGrossTotal = singleNetTotal / (1 - adm.ret_commission);
  const monthlyNetTotal  = monthlyPerLoan * N;
  const monthlyGross     = monthlyNetTotal / (1 - adm.ret_commission);

  // Benefit amount (reference — actual benefit = outstanding monthly debt × 6 months)
  const maxBenPerMember = estInst * adm.ret_benefitMonths;
  const schemeBenAgg    = maxBenPerMember * N;

  // Rate as % of loan book (for quoting letter)
  const oncoffRatePct  = tLoan > 0 ? (singleGrossTotal / tLoan) * 100 : 0;
  const monthlyRatePct = tLoan > 0 ? (monthlyGross      / tLoan) * 100 : 0;

  return {
    product:          'ret',
    n:                N,
    avg_loan:         aLoan,
    total_loan:       tLoan,
    avg_term:         term,
    inc_abs:          !!inc_abs,
    // Once-off (single premium at disbursement)
    oncoff_per_loan:  singlePerLoan,
    oncoff_net:       singleNetTotal,
    oncoff_total:     singleGrossTotal,
    oncoff_rate_pct:  oncoffRatePct,
    // Monthly collection equivalent
    monthly_per_loan: monthlyPerLoan,
    monthly_net:      monthlyNetTotal,
    monthly_total:    monthlyGross,
    monthly_rate_pct: monthlyRatePct,
    // Benefit reference
    benefit_per_member: maxBenPerMember,
    scheme_benefit_agg: schemeBenAgg,
    qualifying_days:  adm.ret_qualifyingDays,
    benefit_months:   adm.ret_benefitMonths,
    agg_cap:          adm.ret_aggCap,
    // Headline figure (selected payment mode)
    total_pa:         payment_mode === 'monthly' ? monthlyGross * 12 : singleGrossTotal,
    adm_used: {
      ret_rateMonthly:adm.ret_rateMonthly, ret_absRateMonthly:adm.ret_absRateMonthly,
      ret_benefitMonths:adm.ret_benefitMonths, ret_commission:adm.ret_commission,
    },
  };
}
