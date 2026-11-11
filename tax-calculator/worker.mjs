import { calculate,defaults } from './calculator.mjs';
const page = '';

export default {
 async fetch(request, env) {
   const path=new URL(request.url).pathname;
   const headers={'cache-control':'no-store','x-content-type-options':'nosniff'};
   if(path==='/'&&request.method==='GET') return new Response(page,{headers:{...headers,'content-type':'text/html; charset=utf-8'}});
   if(!path.endsWith('/calculate')||request.method!=='POST') return new Response('Not found',{status:404});
   try {
     const d=await request.json();
     const valid=(n)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e12;
     const required=['revenue','variable','fixed','workers','variableVat','fixedVat'];
     if(!required.every(key=>valid(d[key]))||!['staff','prior','credit'].every(key=>d[key]===null||valid(d[key]))||
       d.variableVat>100||d.fixedVat>100||typeof d.ip!=='boolean'||
       !['usn','ausn','osnoExempt'].every(key=>['yes','no','unknown'].includes(d[key]))||
       !Array.isArray(d.months)||!(d.months.length===0||(d.months.length===12&&d.months.every(valid)&&Math.abs(d.months.reduce((a,b)=>a+b,0)-d.revenue)<.01))) {
       return Response.json({error:'Проверьте суммы и доли. Сумма за 12 месяцев должна совпадать с годовой выручкой.'},{status:400,headers});
     }
     const params={...defaults,...(env.TAX_PARAMETERS?JSON.parse(env.TAX_PARAMETERS):{})};
     return Response.json(calculate(d,params),{headers});
   } catch {
     return Response.json({error:'Расчёт временно недоступен.'},{status:500,headers});
   }
 }
};
