// method: fetch (varsayılan; domain ya da tam url), script { src, flag }, image (yerel yol),
//         cosmetic { label, tag, id, className, attrs }
// name marka adları için, nameKey çevrilen grup adları için.
// payloads: tasarruf hesabı için örnek betikler, boyutlarını build-lists.mjs ölçüyor.
// scored: main (ağırlık toplamı 100), regional (açıksa skora girer), content (ayrı yüzde)

// engellenmemesi gereken adresler: bağlantı kontrolü ve fastMs eşiği için
export const CONTROL = {
  local: 'favicon.svg',
  hosts: [
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'www.wikipedia.org',
    'github.com',
    'www.mozilla.org',
    'unpkg.com',
    'www.cloudflare.com',
    'code.jquery.com',
  ],
};

export const CATEGORIES = [
  {
    id: 'ads',
    scored: 'main',
    weight: 24,
    groups: [
      {
        name: 'Google Ads',
        items: [
          'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
          'adservice.google.com',
          'www.googleadservices.com',
          'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
          'stats.g.doubleclick.net',
          'ad.doubleclick.net',
          'static.doubleclick.net',
          'tpc.googlesyndication.com',
        ],
        payloads: [
          'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
          'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
        ],
      },
      {
        name: 'Amazon Ads',
        items: ['aax.amazon-adsystem.com', 'c.amazon-adsystem.com', 's.amazon-adsystem.com', 'fls-na.amazon-adsystem.com'],
        payloads: ['https://c.amazon-adsystem.com/aax2/apstag.js'],
      },
      {
        name: 'Microsoft / Xandr',
        items: ['ib.adnxs.com', 'secure.adnxs.com', 'acdn.adnxs.com', 'bat.bing.com'],
      },
      {
        name: 'Taboola & Outbrain',
        items: ['cdn.taboola.com', 'trc.taboola.com', 'widgets.outbrain.com', 'log.outbrain.com'],
        payloads: ['https://widgets.outbrain.com/outbrain.js'],
      },
      {
        name: 'Criteo & AdRoll',
        items: ['static.criteo.net', 'bidder.criteo.com', 'dis.criteo.com', 'd.adroll.com'],
        payloads: ['https://static.criteo.net/js/ld/publishertag.js'],
      },
      {
        name: 'Ad exchanges',
        items: ['fastlane.rubiconproject.com', 'us-u.openx.net', 'a.teads.tv', 'adx.adform.net', 'tlx.3lift.com', 'x.bidswitch.net'],
      },
      {
        name: 'Yandex Direct / AdFox',
        items: ['an.yandex.ru', 'yandexadexchange.net', 'ads.adfox.ru'],
      },
      {
        name: 'Media.net & PubMatic',
        items: ['static.media.net', 'ads.pubmatic.com', 'image6.pubmatic.com'],
      },
      {
        nameKey: 'group.localBait',
        method: 'script',
        items: [
          { src: 'ads/pagead.js', flag: 'pagead' },
          { src: 'ads/ad-banner.js', flag: 'adBanner' },
        ],
      },
      {
        nameKey: 'group.banners',
        method: 'image',
        items: ['ads/banner_728x90.gif', 'ads/banners/ad-300x250.png', 'adimages/sponsor_468x60.jpg'],
      },
    ],
  },

  {
    id: 'analytics',
    scored: 'main',
    weight: 19,
    groups: [
      {
        name: 'Google Analytics / Tag Manager',
        items: [
          'https://www.google-analytics.com/analytics.js',
          'ssl.google-analytics.com',
          'https://www.googletagmanager.com/gtag/js',
          'region1.google-analytics.com',
        ],
        payloads: ['https://www.google-analytics.com/analytics.js'],
      },
      {
        name: 'Hotjar',
        items: ['static.hotjar.com', 'script.hotjar.com', 'insights.hotjar.com', 'vars.hotjar.com'],
      },
      {
        name: 'Microsoft Clarity',
        items: ['www.clarity.ms'],
      },
      {
        name: 'Yandex Metrica',
        items: ['mc.yandex.ru', 'mc.yandex.com'],
        payloads: ['https://mc.yandex.ru/metrika/tag.js'],
      },
      {
        name: 'Mixpanel & Amplitude',
        items: ['api.mixpanel.com', 'cdn.mxpnl.com', 'api2.amplitude.com', 'cdn.amplitude.com'],
        payloads: ['https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js'],
      },
      {
        name: 'Segment & FullStory',
        items: ['cdn.segment.com', 'api.segment.io', 'edge.fullstory.com', 'rs.fullstory.com'],
      },
      {
        name: 'Heap & Chartbeat',
        items: ['cdn.heapanalytics.com', 'static.chartbeat.com', 'ping.chartbeat.net'],
      },
    ],
  },

  {
    id: 'social',
    scored: 'main',
    weight: 9,
    groups: [
      {
        name: 'Meta (Facebook) Pixel',
        items: ['https://connect.facebook.net/en_US/fbevents.js', 'https://www.facebook.com/tr/', 'an.facebook.com'],
        payloads: ['https://connect.facebook.net/en_US/fbevents.js'],
      },
      {
        name: 'X (Twitter)',
        items: ['static.ads-twitter.com', 'ads-api.twitter.com', 'analytics.twitter.com'],
        payloads: ['https://static.ads-twitter.com/uwt.js'],
      },
      {
        name: 'LinkedIn',
        items: ['snap.licdn.com', 'px.ads.linkedin.com', 'ads.linkedin.com'],
        payloads: ['https://snap.licdn.com/li.lms-analytics/insight.min.js'],
      },
      {
        name: 'Pinterest',
        items: ['ct.pinterest.com', 'log.pinterest.com', 'trk.pinterest.com'],
      },
      {
        name: 'Reddit',
        items: ['events.reddit.com', 'events.redditmedia.com', 'alb.reddit.com'],
      },
      {
        name: 'Snapchat & TikTok',
        items: ['tr.snapchat.com', 'sc-static.net', 'analytics.tiktok.com', 'ads-api.tiktok.com', 'business-api.tiktok.com'],
        payloads: ['https://sc-static.net/scevent.min.js', 'https://analytics.tiktok.com/i18n/pixel/events.js'],
      },
    ],
  },

  {
    id: 'cname',
    scored: 'main',
    weight: 8,
    groups: [
      {
        name: 'Adobe Analytics (omtrdc / 2o7)',
        items: [
          'smetrics.samsung.com',
          'smetrics.cnn.com',
          'sstats.adobe.com',
          'smetrics.ford.com',
          'smetrics.hm.com',
          'smetrics.ikea.com',
          'smetrics.ups.com',
          'smetrics.fedex.com',
          'smetrics.vodafone.com.tr',
        ],
      },
      {
        name: 'Wizaly',
        items: ['tk.airfrance.fr', 'tk.lacoste.com'],
      },
    ],
  },

  {
    id: 'cosmetic',
    scored: 'main',
    weight: 14,
    groups: [
      {
        nameKey: 'group.cosmetic.google',
        method: 'cosmetic',
        items: [
          { label: 'ins.adsbygoogle', tag: 'ins', className: 'adsbygoogle' },
          { label: 'div[id^="div-gpt-ad"]', id: 'div-gpt-ad-1500000000000-0' },
          { label: 'div[id^="google_ads_iframe_"]', id: 'google_ads_iframe_/1234/test_0__container__' },
        ],
      },
      {
        nameKey: 'group.cosmetic.classes',
        method: 'cosmetic',
        items: [
          { label: '.ad-banner', className: 'ad-banner' },
          { label: '.advertisement', className: 'advertisement' },
          { label: '.ad-container', className: 'ad-container' },
          { label: '.adsbox', className: 'adsbox' },
          { label: '.banner-ad', className: 'banner-ad' },
          { label: '.ad-slot', className: 'ad-slot' },
          { label: '.sponsored-content', className: 'sponsored-content' },
        ],
      },
      {
        nameKey: 'group.cosmetic.ids',
        method: 'cosmetic',
        items: [
          { label: '#ad-banner', id: 'ad-banner' },
          { label: '#ad_container', id: 'ad_container' },
          { label: '#carbonads', id: 'carbonads' },
          { label: '#adsense', id: 'adsense' },
        ],
      },
      {
        nameKey: 'group.cosmetic.widgets',
        method: 'cosmetic',
        items: [
          { label: '.OUTBRAIN', className: 'OUTBRAIN' },
          { label: '#taboola-below-article-thumbnails', id: 'taboola-below-article-thumbnails' },
        ],
      },
      {
        nameKey: 'group.cosmetic.banners',
        method: 'cosmetic',
        items: [
          { label: 'img[src*="banner_728x90"]', tag: 'img', attrs: { src: 'ads/banner_728x90.gif', alt: '' } },
          { label: 'img[src*="/adimages/"]', tag: 'img', attrs: { src: 'adimages/sponsor_468x60.jpg', alt: '' } },
        ],
      },
    ],
  },

  {
    id: 'telemetry',
    scored: 'main',
    weight: 9,
    groups: [
      {
        name: 'Xiaomi',
        items: ['api.ad.xiaomi.com', 'data.mistat.xiaomi.com', 'tracking.miui.com', 'sdkconfig.ad.xiaomi.com'],
      },
      {
        name: 'Samsung',
        items: ['samsungads.com', 'samsung-com.112.2o7.net', 'config.samsungads.com'],
      },
      {
        name: 'Huawei',
        items: ['metrics.data.hicloud.com', 'metrics2.data.hicloud.com', 'logservice.hicloud.com', 'logbak.hicloud.com'],
      },
      {
        name: 'OPPO, Realme & OnePlus',
        items: ['adsfs.oppomobile.com', 'adx.ads.oppomobile.com', 'bdapi-ads.realmemobile.com', 'open.oneplus.net'],
      },
      {
        name: 'Apple',
        items: ['xp.apple.com', 'metrics.icloud.com', 'securemetrics.apple.com', 'iadsdk.apple.com', 'api-adservices.apple.com'],
      },
      {
        name: 'Sentry',
        items: ['browser.sentry-cdn.com', 'app.getsentry.com'],
      },
      {
        name: 'Bugsnag',
        items: ['notify.bugsnag.com', 'sessions.bugsnag.com', 'api.bugsnag.com'],
      },
      {
        name: 'LogRocket & Rollbar',
        items: ['cdn.lr-ingest.io', 'r.lr-ingest.io', 'api.rollbar.com'],
      },
    ],
  },

  {
    id: 'mobile',
    scored: 'main',
    weight: 7,
    groups: [
      {
        name: 'AppsFlyer & Adjust',
        items: ['app.appsflyer.com', 't.appsflyer.com', 'launches.appsflyer.com', 'app.adjust.com', 's2s.adjust.com'],
      },
      {
        name: 'Branch, Kochava & Singular',
        items: ['api2.branch.io', 'cdn.branch.io', 'control.kochava.com', 'sdk-api-v1.singular.net'],
      },
      {
        name: 'Firebase',
        items: ['app-measurement.com', 'firebase-settings.crashlytics.com'],
      },
      {
        name: 'Unity Ads & AppLovin',
        items: ['auction.unityads.unity3d.com', 'config.unityads.unity3d.com', 'rt.applovin.com', 'd.applovin.com'],
      },
    ],
  },

  {
    id: 'popups',
    scored: 'main',
    weight: 5,
    groups: [
      {
        name: 'PopAds & PopCash',
        items: ['popads.net', 'serve.popads.net', 'c1.popads.net', 'popcash.net'],
      },
      {
        name: 'PropellerAds, Adsterra & co.',
        items: ['propellerads.com', 'adsterra.com', 'clickadu.com', 'ad-maven.com'],
      },
    ],
  },

  {
    id: 'threats',
    scored: 'main',
    weight: 5,
    groups: [
      {
        nameKey: 'group.malwareTest',
        items: ['malware.wicar.org'],
      },
      {
        nameKey: 'group.dyndns',
        items: ['www.duckdns.org', 'www.noip.com', 'www.dynu.com', 'freedns.afraid.org'],
      },
    ],
  },

  // bölgesel
  {
    id: 'turkey',
    scored: 'regional',
    weight: 5,
    groups: [
      {
        nameKey: 'group.tr.ads',
        items: ['static.cdn.admatic.com.tr', 'ads.admatic.com.tr', 'cdn.reklamstore.com', 'reklamaction.com', 'med-api.admost.com'],
      },
      {
        nameKey: 'group.tr.measurement',
        items: ['tr.hit.gemius.pl', 'gatr.hit.gemius.pl'],
      },
      {
        nameKey: 'group.tr.marketing',
        items: ['api.useinsider.com', 'sdk.netmera.com', 'cdn.segmentify.com', 'lgr.visilabs.net', 's.visilabs.net', 'cdn.dengage.com'],
      },
    ],
  },

  // içerik filtreleri, ana skora girmiyor
  {
    id: 'gambling',
    scored: 'content',
    groups: [
      { nameKey: 'group.gambling', items: ['www.bet365.com', 'www.pokerstars.com', 'www.betway.com', 'www.williamhill.com', 'www.888casino.com'] },
    ],
  },
  {
    id: 'piracy',
    scored: 'content',
    groups: [
      { nameKey: 'group.piracy', items: ['thepiratebay.org', '1337x.to', 'nyaa.si'] },
    ],
  },
  {
    id: 'socialnet',
    scored: 'content',
    groups: [
      { nameKey: 'group.socialnet', items: ['www.facebook.com', 'www.instagram.com', 'www.tiktok.com', 'x.com', 'www.reddit.com', 'www.snapchat.com'] },
    ],
  },
  {
    id: 'bypass',
    scored: 'content',
    groups: [
      { nameKey: 'group.doh', items: ['dns.google', 'cloudflare-dns.com', 'dns.quad9.net', 'doh.opendns.com', 'dns.nextdns.io', 'dns.adguard-dns.com'] },
      { nameKey: 'group.vpn', items: ['www.torproject.org', 'nordvpn.com', 'protonvpn.com', 'www.expressvpn.com', 'www.croxyproxy.com'] },
    ],
  },
  {
    id: 'shorteners',
    scored: 'content',
    groups: [
      { nameKey: 'group.shorteners', items: ['bit.ly', 'tinyurl.com', 'ow.ly', 't.co'] },
    ],
  },
];

export function toUrl(item) {
  return /^https?:\/\//.test(item) ? item : `https://${item}/`;
}

export function hostOf(item) {
  return item.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

export function buildTests(categories = CATEGORIES) {
  const tests = [];
  categories.forEach((cat) => cat.groups.forEach((group, gi) => {
    const method = group.method || 'fetch';
    group.items.forEach((item) => {
      const test = { id: tests.length, cat, group, groupKey: `${cat.id}:${gi}`, method };
      if (method === 'fetch') {
        test.url = toUrl(item);
        test.host = hostOf(item);
        test.label = item.replace(/^https:\/\//, '');
      } else if (method === 'script') {
        test.src = item.src;
        test.flag = item.flag;
        test.label = item.src;
      } else if (method === 'image') {
        test.src = item;
        test.label = item;
      } else {
        test.spec = item;
        test.label = item.label;
      }
      tests.push(test);
    });
  }));
  return tests;
}
