<script>
  // The 12 works in the SE translation corpus
  const ABBR = {
    'Will and Testament': 'W&T',
    'Epistle to the Son of the Wolf': 'ESW',
    'Fire Tablet': 'Fire Tablet',
    'Gleanings': 'GWB',
    'Kitab-i-\'Ahd': 'Ahd',
    'Kitab-i-Iqan': 'KIQ',
    'Prayers and Meditations': 'P&M',
    'Tablet of Ahmad': 'Ahmad',
    'Tablet of Carmel': 'Carmel',
    'Tablet of the Holy Mariner': 'Mariner',
    'The Hidden Words': 'HW',
    // Aliases for variant spellings in pre-canned data
    'Hidden Words': 'HW',
    'Kitáb-i-Íqán': 'KIQ',
    'Kitáb-i-Qán': 'KIQ',
  };

  function abbr(work) { return ABBR[work] || work; }

  let showLegend = $state(false);

  const phrases = [
    {
      id: 'heart',
      arabic: 'قَلْبًا جَيِّدًا حَسَنًا مُنيرًا',
      english: 'a pure, kindly and radiant heart',
      source: 'Hidden Words, Arabic §1',
      terms: [
        {
          word: 'قلب',
          transliteration: 'qalb',
          root: 'ق-ل-ب',
          meaning: 'heart',
          hits: 47,
          renderings: [
            { english: 'heart', count: 38, note: 'default rendering',
              examples: [
                { work: 'Will and Testament', idx: 48, src: '...اخدم عتبة قدسک بقلب طافح بسرور...', tr: '...with a heart that overfloweth with the joy...' },
                { work: 'Epistle to the Son of the Wolf', idx: 10, src: '...قرائت نمائيد و بقلب فارغ و سمع طاهر...', tr: '...whose hearts are enlightened, and whose...' },
              ] },
            { english: 'mind', count: 5, note: 'when context is intellectual',
              examples: [
                { work: 'Gleanings', idx: 125, src: '...و ما فی قلبه من العلم...', tr: '...and whatsoever hath been stored up in his mind...' },
              ] },
          ],
          related: [
            { word: 'فؤاد', transliteration: 'fu\'ád', shared: ['heart'],
              example: { work: 'Gleanings', idx: 77, src: '...بفؤاد منير...', tr: '...with a radiant heart...' },
              note: 'More literary/poetic; SE renders both as "heart" but فؤاد appears in elevated registers' },
          ],
        },
        {
          word: 'منير',
          transliteration: 'munír',
          root: 'ن-و-ر',
          meaning: 'luminous, radiant',
          hits: 14,
          renderings: [
            { english: 'radiant', count: 8, note: 'SE\'s preferred rendering',
              examples: [
                { work: 'Hidden Words', idx: 2, src: '...قَلْبًا جَيِّدًا حَسَنًا مُنيرًا...', tr: '...a pure, kindly and radiant heart...' },
              ] },
            { english: 'luminous', count: 4, note: 'modifying abstract nouns',
              examples: [
                { work: 'Epistle to the Son of the Wolf', idx: 30, src: '...الی افقه المشرق المنير...', tr: '...of His shining and luminous Horizon...' },
              ] },
            { english: 'resplendent', count: 2, note: 'emphatic/majestic contexts',
              examples: [
                { work: 'Epistle to the Son of the Wolf', idx: 92, src: '...هذا المقرّ المشرق المنير...', tr: '...this shining and resplendent Seat...' },
              ] },
          ],
          related: [
            { word: 'نور', transliteration: 'núr', shared: ['luminous', 'light'],
              example: { work: 'Gleanings', idx: 19, src: '...نور المبين...', tr: '...the manifest Light...' },
              note: 'Noun vs. adjective: نور is the light itself, منير describes what radiates it' },
            { word: 'مشرق', transliteration: 'mushriq', shared: ['luminous', 'shining'],
              example: { work: 'Epistle to the Son of the Wolf', idx: 30, src: '...المشرق المنير...', tr: '...shining and luminous...' },
              note: 'Often paired with منير; SE distinguishes with "shining" vs. "luminous/radiant"' },
          ],
        },
      ],
    },
    {
      id: 'dayspring',
      arabic: 'مطلع أمر الله',
      english: 'the Dayspring of God\'s Cause',
      source: 'Kitáb-i-Íqán',
      terms: [
        {
          word: 'مطلع',
          transliteration: 'maṭli\'',
          root: 'ط-ل-ع',
          meaning: 'rising-place, dawning-point',
          hits: 23,
          renderings: [
            { english: 'Dayspring', count: 12, note: 'SE\'s signature — solar imagery',
              examples: [
                { work: 'Will and Testament', idx: 38, src: '...مظهر کلّیّۀ الهیّه و مطلع حقیقت مقدّسۀ ربّانیّه...', tr: '...of God and the Dayspring of His Most Divine Essence...' },
                { work: 'Gleanings', idx: 14, src: '...اشرق من مطلع البيان نيّر عرفان...', tr: '...the Day Star of knowledge hath shone forth from the Dayspring of utterance...' },
              ] },
            { english: 'Dawning-place', count: 6, note: 'when literal sense foregrounded',
              examples: [
                { work: 'Kitáb-i-Íqán', idx: 47, src: '...قد اصطفاه الله و جعله مطلعاً لنفسه...', tr: '...God hath singled Him out and made Him the Dawning-place of His Own Self...' },
              ] },
            { english: 'Day Star', count: 5, note: 'personified as celestial body',
              examples: [
                { work: 'Epistle to the Son of the Wolf', idx: 3, src: '...المشرقة من مطلع ارادة الله...', tr: '...the Day Star of His most exalted Will...' },
              ] },
          ],
          related: [
            { word: 'مشرق', transliteration: 'mashriq', shared: ['Dayspring', 'Dawning-place'],
              example: { work: 'Gleanings', idx: 14, src: '...اشرق من مشرق القدس...', tr: '...hath shone from the Dawning-place of holiness...' },
              note: 'Same root ط-ل-ع family of solar imagery; SE sometimes uses identical English for both' },
          ],
        },
        {
          word: 'أمر',
          transliteration: 'amr',
          root: 'أ-م-ر',
          meaning: 'command, cause, matter',
          hits: 89,
          renderings: [
            { english: 'Cause', count: 52, note: 'the Bahá\'í Cause — capitalized',
              examples: [
                { work: 'Will and Testament', idx: 38, src: '...حفظاً لأمر اللّه و صیانةً لدینه...', tr: '...the protection of the Cause of God, the preservation of His Law...' },
                { work: 'Gleanings', idx: 31, src: '...ان انصروا أمر ربّکم الرحمن...', tr: '...arise to aid the Cause of your Lord, the Merciful...' },
              ] },
            { english: 'Command', count: 18, note: 'divine imperative contexts',
              examples: [
                { work: 'Epistle to the Son of the Wolf', idx: 40, src: '...انّا نأمر عباد اللّه و اماءه...', tr: '...We command the servants of God and His handmaidens...' },
              ] },
            { english: 'Revelation', count: 12, note: 'synonymous with divine mission',
              examples: [
                { work: 'Gleanings', idx: 22, src: '...فی ظهور أمره و بروز سلطنته...', tr: '...at the Revelation of His glory and the manifestation of His sovereignty...' },
              ] },
          ],
          related: [
            { word: 'دين', transliteration: 'dín', shared: ['Cause', 'Faith'],
              example: { work: 'Will and Testament', idx: 38, src: '...حفظاً لأمر اللّه و صیانةً لدینه...', tr: '...the protection of the Cause of God, the preservation of His Law...' },
              note: 'أمر and دين appear side by side; SE renders أمر as "Cause" and دين as "Law" or "Faith" to differentiate' },
          ],
        },
      ],
    },
    {
      id: 'sovereignty',
      arabic: 'مُلْكًا دائِمًا باقِيًا أَزَلًا قَدِيمًا',
      english: 'a sovereignty ancient, imperishable and everlasting',
      source: 'Hidden Words, Arabic §1',
      terms: [
        {
          word: 'ملك',
          transliteration: 'mulk',
          root: 'م-ل-ك',
          meaning: 'sovereignty, dominion, kingdom',
          hits: 34,
          renderings: [
            { english: 'sovereignty', count: 14, note: 'abstract divine authority',
              examples: [
                { work: 'Gleanings', idx: 31, src: '...الملك والملكوت للّه ربّ الأرباب...', tr: '...His all-conquering sovereignty is manifest...' },
                { work: 'Gleanings', idx: 66, src: '...الملك يومئذ لله...', tr: '...On this Day all sovereignty is, in very deed, with God...' },
              ] },
            { english: 'dominion', count: 11, note: 'power exercised over creation',
              examples: [
                { work: 'Gleanings', idx: 45, src: '...ملکی لا یزول و سلطانی لا یفنی...', tr: '...My sovereignty endureth and My dominion perisheth not...' },
              ] },
            { english: 'kingdom', count: 9, note: 'realm or domain sense',
              examples: [
                { work: 'Kitáb-i-Íqán', idx: 89, src: '...ملكوت الأسماء و صفات...', tr: '...the kingdom of names and attributes...' },
              ] },
          ],
          related: [
            { word: 'سلطان', transliteration: 'sulṭán', shared: ['sovereignty', 'dominion'],
              example: { work: 'Gleanings', idx: 45, src: '...ملکی لا یزول و سلطانی لا یفنی...', tr: '...My sovereignty endureth and My dominion perisheth not...' },
              note: 'SE uses both in the same sentence: ملك → "sovereignty", سلطان → "dominion" — near-synonyms deliberately split' },
          ],
        },
        {
          word: 'أزل',
          transliteration: 'azal',
          root: 'أ-ز-ل',
          meaning: 'eternity (past), pre-existence',
          hits: 18,
          renderings: [
            { english: 'everlasting', count: 8, note: 'duration emphasis',
              examples: [
                { work: 'Hidden Words', idx: 2, src: '...مُلْكًا دائِمًا باقِيًا أَزَلًا قَدِيمًا...', tr: '...a sovereignty ancient, imperishable and everlasting...' },
              ] },
            { english: 'eternity', count: 6, note: 'as noun',
              examples: [
                { work: 'Gleanings', idx: 19, src: '...من أزل الآزال...', tr: '...from eternity past...' },
              ] },
          ],
          related: [
            { word: 'قديم', transliteration: 'qadím', shared: ['everlasting', 'ancient'],
              example: { work: 'Hidden Words', idx: 2, src: '...مُلْكًا دائِمًا باقِيًا أَزَلًا قَدِيمًا...', tr: '...a sovereignty ancient, imperishable and everlasting...' },
              note: 'أزل (pre-eternity) and قديم (ancient) both describe timelessness; SE assigns each a distinct English word' },
          ],
        },
      ],
    },
    {
      id: 'justice',
      arabic: 'إنّ الإنصافَ و العدلَ',
      english: 'equity and justice',
      source: 'Kitáb-i-Íqán',
      terms: [
        {
          word: 'إنصاف',
          transliteration: 'inṣáf',
          root: 'ن-ص-ف',
          meaning: 'equity, fairness',
          hits: 11,
          renderings: [
            { english: 'equity', count: 5, note: 'SE\'s preferred — distinct from عدل',
              examples: [
                { work: 'Kitáb-i-Íqán', idx: 6, src: '...بانصاف و عدل نظر نمائيد...', tr: '...look with equity and justice...' },
                { work: 'Gleanings', idx: 100, src: '...لسان انصاف...', tr: '...the tongue of equity...' },
              ] },
            { english: 'fairness', count: 4, note: 'interpersonal contexts',
              examples: [
                { work: 'Epistle to the Son of the Wolf', idx: 55, src: '...بانصاف حکم کنيد...', tr: '...judge with fairness...' },
              ] },
            { english: 'justice', count: 2, note: 'rare — only when paired with عدل would create redundancy',
              examples: [
                { work: 'Hidden Words', idx: 4, src: '...يا قوم العدل أحبّ الأشياء عندی الانصاف...', tr: '...O PEOPLE OF JUSTICE! The best beloved of all things in My sight is Justice...' },
              ] },
          ],
          related: [
            { word: 'عدل', transliteration: '\'adl', shared: ['justice', 'equity'],
              example: { work: 'Hidden Words', idx: 4, src: '...يا قوم العدل أحبّ الأشياء عندی الانصاف...', tr: '...O PEOPLE OF JUSTICE! The best beloved of all things in My sight is Justice...' },
              note: 'HW Arabic §2 is the key passage: عدل → "Justice" (people of), انصاف → "Justice" (beloved thing) — same English word, two different Arabic concepts. Elsewhere SE carefully separates them: عدل = "justice", انصاف = "equity/fairness"' },
          ],
        },
        {
          word: 'عدل',
          transliteration: '\'adl',
          root: 'ع-د-ل',
          meaning: 'justice, righteousness',
          hits: 28,
          renderings: [
            { english: 'justice', count: 18, note: 'primary rendering — cosmic/divine justice',
              examples: [
                { work: 'Gleanings', idx: 88, src: '...ميزان عدل الهی...', tr: '...the balance of divine justice...' },
                { work: 'Hidden Words', idx: 4, src: '...يا قوم العدل...', tr: '...O PEOPLE OF JUSTICE...' },
              ] },
            { english: 'righteousness', count: 6, note: 'moral/ethical contexts',
              examples: [
                { work: 'Kitáb-i-Íqán', idx: 22, src: '...اهل عدل و انصاف...', tr: '...the people of righteousness and fairness...' },
              ] },
            { english: 'equity', count: 4, note: 'when انصاف is absent and both senses needed',
              examples: [
                { work: 'Epistle to the Son of the Wolf', idx: 70, src: '...بعدل حکم کنيد...', tr: '...judge with equity...' },
              ] },
          ],
          related: [
            { word: 'إنصاف', transliteration: 'inṣáf', shared: ['justice', 'equity'],
              example: { work: 'Kitáb-i-Íqán', idx: 6, src: '...بانصاف و عدل نظر نمائيد...', tr: '...look with equity and justice...' },
              note: 'When both appear together, SE splits: إنصاف → "equity", عدل → "justice". When only one appears, the English choice depends on context.' },
          ],
        },
      ],
    },
    {
      id: 'irfan',
      arabic: 'عرفان حقيقی',
      english: 'true recognition / knowledge',
      source: 'Kitáb-i-Íqán',
      terms: [
        {
          word: 'عرفان',
          transliteration: '\'irfán',
          root: 'ع-ر-ف',
          meaning: 'knowledge, gnosis, recognition',
          hits: 16,
          renderings: [
            { english: 'recognition', count: 7, note: 'recognizing the Manifestation',
              examples: [
                { work: 'Kitáb-i-Íqán', idx: 4, src: '...عرفان مظاهر قدس...', tr: '...the recognition of the holy Manifestations...' },
                { work: 'Kitáb-i-Íqán', idx: 12, src: '...باب عرفان ذات قدم...', tr: '...the gate of the recognition of the Ancient of Days...' },
              ] },
            { english: 'knowledge', count: 5, note: 'general epistemological sense',
              examples: [
                { work: 'Epistle to the Son of the Wolf', idx: 32, src: '...در صدر مجلس عرفان مستوی...', tr: '...in the council of knowledge, whilst the acknowledged...' },
              ] },
            { english: 'true understanding', count: 4, note: 'mystical connotation',
              examples: [
                { work: 'Kitáb-i-Íqán', idx: 78, src: '...عرفان کامل و يقين تام...', tr: '...true understanding and complete certitude...' },
              ] },
          ],
          related: [
            { word: 'معرفت', transliteration: 'ma\'rifat', shared: ['knowledge', 'recognition'],
              example: { work: 'Kitáb-i-Íqán', idx: 31, src: '...معرفت حقّ...', tr: '...the knowledge of God...' },
              note: 'عرفان is the act of gnosis; معرفت is its result — SE distinguishes context but both can yield "knowledge"' },
          ],
        },
        {
          word: 'حقيقی',
          transliteration: 'ḥaqíqí',
          root: 'ح-ق-ق',
          meaning: 'true, real, genuine',
          hits: 22,
          renderings: [
            { english: 'true', count: 14, note: 'default — simple and clear',
              examples: [
                { work: 'Kitáb-i-Qán', idx: 55, src: '...ایمان حقيقی...', tr: '...true and genuine faith...' },
              ] },
            { english: 'real', count: 5, note: 'contrasting with illusory',
              examples: [
                { work: 'Gleanings', idx: 83, src: '...حيات حقيقی...', tr: '...real life...' },
              ] },
          ],
          related: [],
        },
      ],
    },
  ];

  let selected = $state(null);
</script>

<div class="w-full">
  <!-- Phrase selector -->
  <div class="flex items-center gap-2 mb-3">
    <span class="font-mono text-[10px] tracking-[0.35em] uppercase text-gold-500/60 shrink-0">Try CTAI</span>
    <div class="flex-1 h-px bg-ink-700/40"></div>
  </div>

  <div class="flex flex-wrap gap-2 mb-1">
    {#each phrases as phrase}
      <button
        onclick={() => selected = selected?.id === phrase.id ? null : phrase}
        class="group text-left rounded-lg border px-3 py-2.5 transition-all {selected?.id === phrase.id
          ? 'bg-gold-500/10 border-gold-500/30'
          : 'bg-ink-850 border-ink-700/40 hover:border-ink-600/60'}"
      >
        <span class="font-arabic text-sm text-gold-300 block leading-relaxed" dir="rtl" lang="ar">{phrase.arabic}</span>
        <span class="text-[10px] text-ink-500 font-mono block mt-0.5">{phrase.english}</span>
      </button>
    {/each}
  </div>
  <p class="text-[10px] text-ink-600 font-mono mb-4">Select a phrase to see how Jafar analyzes it</p>

  <!-- Analysis panel -->
  {#if selected}
    <div class="bg-ink-850 rounded-xl border border-ink-700/40 overflow-hidden animate-fade-up" style="animation-duration: 0.3s">
      <!-- Header -->
      <div class="bg-ink-950 px-5 py-4 border-b border-ink-800/60 flex items-center justify-between">
        <div>
          <p class="font-arabic text-lg text-gold-300/80" dir="rtl" lang="ar">{selected.arabic}</p>
          <p class="text-[10px] text-ink-500 font-mono mt-1">{selected.source}</p>
        </div>
        <button onclick={() => selected = null} class="text-ink-600 hover:text-ink-400 transition-colors text-xs font-mono px-2 py-1 rounded hover:bg-ink-800">close</button>
      </div>

      <!-- Term reports: [word] - [rendering] - [source] | [translation] grouped by word then rendering -->
      <div class="p-5 space-y-5">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-6 h-6 rounded bg-ink-800 border border-ink-700/60 flex items-center justify-center text-gold-400/70 text-[10px] font-mono">J</div>
          <span class="font-mono text-[10px] tracking-wider text-ink-500 uppercase">Jafar &middot; Research Agent &middot; {selected.terms.length} terms analyzed</span>
        </div>

        {#each selected.terms as term}
          <div class="space-y-1.5">
            <!-- Word heading -->
            <div class="flex items-baseline gap-2 pb-1 border-b border-ink-800/40 mb-2">
              <span class="font-arabic text-gold-400 text-base" dir="rtl" lang="ar">{term.word}</span>
              <span class="text-ink-500 font-mono text-[10px]">{term.transliteration}</span>
              <span class="text-ink-700 font-mono text-[10px]">{term.root}</span>
              <span class="text-ink-600 text-[10px]">&mdash; {term.meaning}</span>
              <span class="ml-auto text-[10px] text-ink-600 font-mono">{term.hits} hits</span>
            </div>

            <!-- Grouped by rendering -->
            {#each term.renderings as r}
              <div class="pl-1">
                <!-- Rendering label -->
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-arabic text-gold-400/60 text-xs" dir="rtl" lang="ar">{term.word}</span>
                  <span class="text-ink-600 text-[10px]">&rarr;</span>
                  <span class="text-gold-200 text-xs font-medium">&ldquo;{r.english}&rdquo;</span>
                  <span class="text-ink-600 text-[10px] font-mono">&times;{r.count}</span>
                  <span class="text-ink-500 text-[10px]">{r.note}</span>
                </div>
                <!-- Examples: source | translation -->
                {#each r.examples as ex}
                  <div class="flex items-start gap-0 text-[11px] leading-relaxed ml-4 mb-1">
                    <span class="font-arabic text-ink-400 shrink-0" dir="rtl" lang="ar">{ex.src}</span>
                    <span class="text-ink-700 mx-1.5 shrink-0">|</span>
                    <span class="text-ink-300">{ex.tr}</span>
                    <span class="text-ink-600 font-mono text-[9px] ml-2 shrink-0 pt-0.5" title={ex.work}>{abbr(ex.work)}&sect;{ex.idx}</span>
                  </div>
                {/each}
              </div>
            {/each}

            <!-- Related terms (overlapping English renderings) -->
            {#if term.related?.length}
              <div class="mt-2 pt-2 border-t border-ink-800/30">
                <span class="text-[10px] text-ink-600 font-mono tracking-wider uppercase">See also</span>
                {#each term.related as rel}
                  <div class="mt-1.5 pl-1">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-arabic text-amber-400/60 text-xs" dir="rtl" lang="ar">{rel.word}</span>
                      <span class="text-ink-500 font-mono text-[10px]">{rel.transliteration}</span>
                      <span class="text-ink-700 text-[10px]">&mdash; also &rarr;</span>
                      <span class="text-amber-300/70 text-[10px]">{rel.shared.map(s => `\u201c${s}\u201d`).join(', ')}</span>
                    </div>
                    <div class="flex items-start gap-0 text-[11px] leading-relaxed ml-4 mb-1">
                      <span class="font-arabic text-ink-400 shrink-0" dir="rtl" lang="ar">{rel.example.src}</span>
                      <span class="text-ink-700 mx-1.5 shrink-0">|</span>
                      <span class="text-ink-300">{rel.example.tr}</span>
                      <span class="text-ink-600 font-mono text-[9px] ml-2 shrink-0 pt-0.5" title={rel.example.work}>{abbr(rel.example.work)}&sect;{rel.example.idx}</span>
                    </div>
                    <p class="text-[10px] text-ink-500 ml-4 leading-relaxed">{rel.note}</p>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}

        <!-- Legend toggle -->
        <div class="pt-2 border-t border-ink-800/40">
          <button onclick={() => showLegend = !showLegend}
            aria-expanded={showLegend}
            aria-label="Toggle legend"
            class="text-[10px] text-ink-500 font-mono hover:text-ink-400 transition-colors">
            {showLegend ? '&#9660;' : '&#9654;'} Abbreviations
          </button>
          {#if showLegend}
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[9px] font-mono text-ink-600">
              {#each Object.entries(ABBR).filter(([k, v], i, a) => a.findIndex(([, v2]) => v2 === v) === i) as [full, short]}
                <span><span class="text-ink-400">{short}</span> {full}</span>
              {/each}
            </div>
          {/if}
          <p class="text-[10px] text-ink-600 font-mono text-center mt-2">
            Pre-computed analysis &middot; Live results via <code class="text-gold-500/60">POST /api/research</code>
          </p>
        </div>
      </div>
    </div>
  {/if}
</div>
