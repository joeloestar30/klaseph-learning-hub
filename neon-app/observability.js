(() => {
  const KEY='klaseph-operational-events';
  const LIMIT=100;
  const safeText=value=>String(value?.message||value||'Unknown error').slice(0,500);
  function capture(category,error,context={}) {
    const event={timestamp:new Date().toISOString(),category,message:safeText(error),context};
    try {
      const events=JSON.parse(localStorage.getItem(KEY)||'[]');events.unshift(event);
      localStorage.setItem(KEY,JSON.stringify(events.slice(0,LIMIT)));
    } catch {}
    console.error(`[KlasePH:${category}]`,event);
    return event;
  }
  async function rpc(client,name,args) {
    try {
      const result=await client.rpc(name,args);
      if(result.error)capture('rpc',result.error,{name});
      return result;
    } catch(error) {
      capture('rpc',error,{name});
      return {data:null,error:{message:safeText(error)}};
    }
  }
  function recent(){try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch{return [];}}
  window.addEventListener('error',event=>capture('frontend',event.error||event.message,{source:event.filename||''}));
  window.addEventListener('unhandledrejection',event=>capture('promise',event.reason));
  window.KLASEPH_MONITOR={capture,rpc,recent};
})();
