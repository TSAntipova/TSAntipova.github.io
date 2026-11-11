export const defaults = {
 year:2026, exemption:20000000, vatTier:272500000, usnLimit:490500000, ausnLimit:60000000,
 low:.05, high:.07, vat:.22, usnIncome:.06, usnProfit:.15, usnMin:.01,
 ausnIncome:.08, ausnProfit:.20, ausnMin:.03, corporate:.25, deduction:.50,
 fixed:57390, extraThreshold:300000, extraRate:.01, extraMax:321818, injury:2959,
 brackets:[[2400000,.13],[5000000,.15],[20000000,.18],[50000000,.20],[null,.22]]
};

function progressive(base, brackets) {
 let from=0;
 return brackets.reduce((tax,[to,rate])=>{
   const part=Math.max(0,Math.min(base,to??Infinity)-from);
   from=to;
   return tax+part*rate;
 },0);
}

export function calculate(d,p=defaults) {
 const {revenue,variable,fixed,variableVat,fixedVat,workers,prior,staff,months,ip,usn,ausn,osnoExempt}=d;
 const expense=variable+fixed;
 const vatPart=variable*variableVat/100+fixed*fixedVat/100;
 const rows=[];
 const modelIncome=prior??0;
 for(const [mode,name,types] of [
   ['ui','УСН «Доходы»',['none','special','standard']],
   ['up','УСН «Доходы − расходы»',['none','special','standard']],
   ['o','ОСНО',['none','standard']],
   ['ai','АУСН «Доходы»',['none']],
   ['ap','АУСН «Доходы − расходы»',['none']]
 ]) for(const type of types) {
   const isUsn=mode.startsWith('u'), isAusn=mode.startsWith('a');
   const next=type==='standard'?p.vat:type==='special'?(modelIncome>p.vatTier?p.high:p.low):0;
   const label=type==='special'?'НДС '+(next*100).toFixed(0)+'% / '+(p.high*100).toFixed(0)+'%':type==='standard'?'НДС '+(p.vat*100).toFixed(0)+'%':'Без НДС';
   let reason='', status='available';
   const reject=(message)=>{ if(status!=='unavailable'){status='unavailable';reason=message} };
   const ask=(message)=>{ if(status==='available'){status='unknown';reason=message} };
   if(isUsn){
     if(usn==='no'||(prior!==null&&prior>p.usnLimit)) reject('Не выполнены условия УСН');
     if(usn==='unknown') ask('Подтвердите условия УСН');
     if(prior===null) ask('Укажите доход за прошлый год');
     if(type==='none'&&prior>p.exemption) reject('Превышен лимит освобождения от НДС');
     if(type!=='none'&&prior!==null&&prior<=p.exemption&&revenue<=p.exemption) reject('Действует освобождение от НДС');
   }
   if(isAusn){
     if(ausn==='no'||staff>5||revenue>p.ausnLimit||prior>p.ausnLimit) reject('Не выполнены условия АУСН');
     if(ausn==='unknown'||staff===null||prior===null) ask('Уточните условия АУСН, доход и численность');
   }
   if(mode==='o'&&type==='none'&&osnoExempt!=='yes'){
     if(osnoExempt==='no') reject('Нет освобождения от НДС');
     else ask('Уточните основание освобождения от НДС');
   }
   if(mode==='o'&&type==='standard'&&osnoExempt==='yes') ask('Уточните возможность применения стандартного НДС');
   const thresholdCross=isUsn&&((modelIncome<=p.exemption&&revenue>p.exemption)||
     (type==='special'&&modelIncome<=p.vatTier&&revenue>p.vatTier));
   if(thresholdCross&&type==='none') ask('Для сравнения нужен сценарий с переходом на НДС');
   if(thresholdCross&&type!=='none'&&!months.length) ask('Укажите помесячную выручку для смены ставки');
   let output=0, vatSales=0, cumulative=0;
   for(const gross of months.length?months:[revenue]){
     let rate=next;
     if(isUsn&&type!=='none'){
       const taxable=modelIncome>p.exemption||cumulative>p.exemption;
       rate=taxable?(type==='standard'?p.vat:Math.max(modelIncome,cumulative)>p.vatTier?p.high:p.low):0;
     }
     const net=gross/(1+rate);
     output+=net;
     cumulative+=net;
     if(rate===p.vat) vatSales+=gross;
   }
   if(isUsn&&output>p.usnLimit) reject('Превышен годовой лимит УСН');
   const outgoing=revenue-output;
   const share=revenue?vatSales/revenue:0;
   const credit=type==='standard'?(d.credit??vatPart*p.vat/(1+p.vat)*share):0;
   if(type==='standard'&&isUsn&&share<1&&d.credit===null&&vatPart>0) ask('Уточните вычет входного НДС при переходе');
   const payroll=isAusn?(staff>0?p.injury:0):workers;
   const beforeOwn=output-expense+credit-payroll;
   const ownBase=mode==='up'||mode==='o'?beforeOwn:output;
   const own=ip&&!isAusn?p.fixed+Math.min(p.extraMax,Math.max(0,ownBase-p.extraThreshold)*p.extraRate):0;
   const operating=beforeOwn-own;
   const baseTax=mode==='ui'?output*p.usnIncome:mode==='up'?Math.max(operating*p.usnProfit,output*p.usnMin):
     mode==='ai'?output*p.ausnIncome:mode==='ap'?Math.max(operating*p.ausnProfit,output*p.ausnMin):
     ip?progressive(operating,p.brackets):Math.max(0,operating*p.corporate);
   const deduction=mode==='ui'?Math.min(payroll+own,baseTax*(ip&&staff===0&&workers===0?1:p.deduction)):0;
   const tax=baseTax-deduction;
   const profit=operating-tax;
   const details=[
     ['Поступления от покупателей',revenue],['Выручка без НДС',output],
     ['Переменные расходы',-variable],['Постоянные расходы',-fixed],
     ['Страховые взносы за сотрудников',-payroll],['Взносы ИП за себя',-own],
     ['Операционная прибыль',operating],['Исчисленный налог',-baseTax],
     ['Уменьшение налога на взносы',deduction],['Налог по режиму',-tax],
     ['Чистая прибыль',profit]
   ];
   if(type!=='none') details.splice(2,0,['НДС с продаж',outgoing],['Входной НДС к вычету',credit],['НДС к уплате / возмещению',outgoing-credit]);
   rows.push({name,label,status,reason,profit,tax,details});
 }
 return {year:p.year,rows};
}
