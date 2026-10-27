// DNS sadece domain engelleyebilir. aynı origin'deki yol bazlı yemleri (ads/pagead.js)
// veya kozmetik elementleri ancak bir eklenti engelleyebilir.

import { tally } from './score.js';

const ratio = (s) => (s.counted ? s.blocked / s.counted : 0);

export function detectProfile(tests, results, { isBrave = false } = {}) {
  const local = tally(tests.filter((x) => x.method === 'script' || x.method === 'image'), results);
  const cosmetic = tally(tests.filter((x) => x.method === 'cosmetic'), results);
  const network = tally(tests.filter((x) => x.method === 'fetch' && x.cat.scored === 'main'), results);
  const content = tally(tests.filter((x) => x.method === 'fetch' && x.cat.scored === 'content'), results);
  const cname = tally(tests.filter((x) => x.cat.id === 'cname'), results);

  const extension = local.blocked > 0 || ratio(cosmetic) >= 0.25;
  const networkBlocking = ratio(network) >= 0.2;

  let id = 'none';
  if (isBrave) id = 'brave';
  else if (extension) id = 'extension';
  else if (networkBlocking) id = 'dns';

  const tips = [];
  if (id === 'extension' || id === 'brave') tips.push('tip.extensionMasksDns');
  // eklenti normal izleyicileri engelliyor ama CNAME'li olanları kaçırıyor
  if ((id === 'extension' || id === 'brave') && ratio(network) >= 0.5 && cname.counted && ratio(cname) < 0.5) {
    tips.push('tip.cname');
  }
  if (id === 'dns') tips.push('tip.dnsNoCosmetic');
  if (id === 'none') tips.push('tip.noneChecks');
  if (network.timeout >= 5 || (network.counted && network.timeout / network.counted >= 0.1)) tips.push('tip.nxdomain');
  if (ratio(content) >= 0.5 && !networkBlocking) tips.push('tip.isp');

  return {
    id,
    tips,
    stats: {
      network: Math.round(ratio(network) * 100),
      cosmetic: Math.round(ratio(cosmetic) * 100),
      local: local.blocked,
      timeouts: network.timeout,
    },
  };
}
