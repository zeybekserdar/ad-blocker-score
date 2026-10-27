# Ad Blocker Score

> Reklam Engelleyici Testi / Ad Blocker & DNS Blocking Test

Tarayıcıdaki reklam engelleyicinin (uBlock Origin, AdGuard, Brave) ve DNS filtresinin (Pi-hole, AdGuard Home, NextDNS) gerçekte neyi engellediğini ölçen statik bir sayfa. Build adımı yok, düz HTML/CSS/JS.

## Neler test ediliyor

Ana skor 100 üzerinden. Kategori ağırlıkları `js/tests.js` içinde:

| Kategori | Puan |
| --- | --- |
| Reklam ağları | 24 |
| Analitik | 19 |
| Kozmetik | 14 |
| Sosyal medya izleyicileri | 9 |
| OEM telemetri ve hata izleme | 9 |
| CNAME ile gizlenmiş izleyiciler | 8 |
| Mobil SDK'lar | 7 |
| Pop-up | 5 |
| Zararlı yazılım / dolandırıcılık | 5 |

Bunların dışında:

- Türkiye paketi (Admatic, ReklamStore, AdMost, Gemius, Insider, Netmera, Segmentify...). Açıksa skora 5 puanla giriyor, Türkçe arayüzde varsayılan olarak açık.
- İçerik filtreleri (kumar, korsan, sosyal ağlar, DoH/VPN, URL kısaltıcılar). Ayrı bir yüzde olarak gösteriliyor, ana skoru etkilemiyor.

## Nasıl çalışıyor

Her domain'e `no-cors` fetch atılıyor. Önce 8 nötr adresten oluşan bir kontrol grubu çalışıyor; "hızlı düşme" eşiği bunların medyan süresinden hesaplanıyor. Başarısız istekler bir kez daha deneniyor:

- iki deneme de hızlı düştüyse engellendi,
- ikisi de yavaşsa sunucu ayakta ama isteği reddediyor, geçti sayılıyor,
- önce yavaş sonra hızlıysa domain ölü, skora katılmıyor,
- 5 sn cevap gelmezse engellendi (genelde 0.0.0.0 dönen DNS engeli).

Kozmetik testler için sayfaya reklam gibi görünen elementler ekleniyor; `ads/` ve `adimages/` altında da yem betik ve görseller var. DNS bunları engelleyemediği için sonuçlardan engellemenin eklentiyle mi DNS'le mi yapıldığı da tahmin edilebiliyor.

Test bitince:

- hangi HaGeZi kademesinin ve OISD listesinin aktif olduğu tahmin ediliyor,
- geçenler için uBO/AdGuard, Pi-hole ya da hosts formatında kural üretiliyor,
- engellenen betiklerin yaklaşık boyutu gösteriliyor,
- sonuç tarayıcıda saklanıyor (son 10), iki çalıştırma karşılaştırılabiliyor.

## Çalıştırma

ES module kullandığı için `file://` ile açılmıyor, bir sunucu lazım:

```bash
python3 -m http.server 8080
```

## Liste verisi

`data/lists.json` dosyasını `scripts/build-lists.mjs` üretiyor. HaGeZi ve OISD listelerini indirip her test domain'inin hangi listelerde olduğuna, CNAME hedefine ve hâlâ çözülüp çözülmediğine bakıyor; tasarruf hesabı için birkaç betiğin boyutunu da ölçüyor. DNS sorguları 1.1.1.1 üzerinden gidiyor, yani makinede Pi-hole açık olsa da sonuç değişmiyor.

```bash
node scripts/build-lists.mjs
node scripts/selftest.mjs
```

`.github/workflows/update-lists.yml` bunu her gün çalıştırıp değişiklik varsa commit ediyor. Dosya yoksa sayfa yine çalışıyor, sadece rozetler ve liste tespiti görünmüyor.

## Test eklemek

`js/tests.js` içinde ilgili gruba satır eklemek yeterli. Yeni kategori eklerseniz `js/locales/tr.js` ve `en.js` içine `cat.<id>` ve `cat.<id>.desc` çevirilerini de ekleyin. Ana kategorilerin ağırlık toplamı 100 kalmalı, selftest bunu kontrol ediyor. Yeni domain ekledikten sonra rozetlerin görünmesi için `build-lists.mjs`'i tekrar çalıştırın.

## Gizlilik

Sayfa veri toplamıyor ve bir yere göndermiyor; geçmiş sadece ziyaretçinin kendi tarayıcısında duruyor. Engellenmeyen istekler tabii ki ilgili sunuculara gidiyor (çerezsiz).
