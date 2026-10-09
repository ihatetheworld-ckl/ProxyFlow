import type { Config, ProxyServer } from "../utils/types";
export function directive(p: ProxyServer): string {
  return (
    { http: "PROXY", https: "HTTPS", socks4: "SOCKS", socks5: "SOCKS5" }[
      p.protocol
    ] +
    " " +
    (p.host.includes(":") ? "[" + p.host + "]" : p.host) +
    ":" +
    p.port
  );
}
// Keep emitted ES5 source literal: bundler function renaming must never change PAC bindings.
export function compilePac(c: Config): string {
  const exits = Object.fromEntries(c.proxies.map((p) => [p.id, directive(p)]));
  return `var rules=${JSON.stringify(c.rules)};var exits=${JSON.stringify(exits)};var selected=${JSON.stringify(c.selectedId)};
 function ipv4(host){var parts=host.split('.');if(parts.length!==4)return null;var n=0;for(var i=0;i<4;i++){if(!/^[0-9]{1,3}$/.test(parts[i])||(parts[i].length>1&&parts[i].charAt(0)==='0')||Number(parts[i])>255)return null;n=n*256+Number(parts[i]);}return n>>>0;}
 function inCidr(host,cidr){var p=cidr.split('/'),ip=ipv4(host),base=ipv4(p[0]),bits=Number(p[1]);if(ip===null||base===null)return false;var mask=bits===0?0:(0xffffffff<<(32-bits))>>>0;return (ip&mask)===(base&mask);}
 function matches(r,host){host=host.toLowerCase().replace(/\\.$/,'');var v=r.value;switch(r.type){case 'DOMAIN':return host===v;case 'DOMAIN-SUFFIX':return host===v||host.slice(-(v.length+1))==='.'+v;case 'DOMAIN-KEYWORD':return host.indexOf(v)!==-1;case 'IP-CIDR':return inCidr(host,v);case 'MATCH':return true;}return false;}
 function FindProxyForURL(url,host){for(var i=0;i<rules.length;i++){var r=rules[i];if(matches(r,host)){if(r.action==='DIRECT')return 'DIRECT';if(r.action==='REJECT')return 'PROXY 127.0.0.1:9';return exits[r.proxyId||selected]||'PROXY 127.0.0.1:9';}}return 'PROXY 127.0.0.1:9';}`;
}
