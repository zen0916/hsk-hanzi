# 사용법: ruby -Ku tools/build.rb   (hsk-hanzi 폴더에서 실행)
# src/ 의 원본 데이터와 한국어 내용(ko-*.txt)을 합쳐 data.js를 만든다.
require "json"
Encoding.default_external = "UTF-8"
ROOT = File.expand_path("..", __dir__)
def src(f); File.join(ROOT, "src", f); end

words = JSON.parse(File.read(src("hsk-words.json")))
dec = JSON.parse(File.read(src("hanzi-decomp.json")))
D = dec["chars"].to_h { |x| [x["c"], x] }
PHO_PY = dec["pinyin"]

# ---- 한국어 내용 읽기 (뒤에 오는 파일이 앞의 내용을 덮어씀) ----
KW = {}   # 단어 → [뜻, 병음 덮어쓰기]
KC = {}   # 한자 → {k, o, m, t, p}
files = [src("ko-legacy.txt")] + Dir[src("ko-L*.txt")].sort
files.each do |f|
  mode = nil
  File.foreach(f) do |line|
    line = line.chomp
    next if line.strip.empty? || line.start_with?("#")
    if line.start_with?("@") then mode = line; next end
    if mode == "@w"
      w, m, p = line.split("\t")
      KW[w] = [m, p]
    else
      c, k, o, m, t, parts = line.split("|", -1)
      prev = KC[c] || {}
      KC[c] = {
        "k" => k, "o" => (o.to_s.empty? ? prev["o"] : o), "m" => (m.to_s.empty? ? prev["m"] : m),
        "t" => (t.to_s.empty? ? prev["t"] : t), "p" => (parts.to_s.empty? ? prev["p"] : parts.split(","))
      }
    end
  end
end
# 단어 구성 풀이·예문: src/ex-L*.txt  (단어|왜 이 한자들인지|예문|예문 번역)
EX = {}
Dir[src("ex-L*.txt")].sort.each { |ef| File.foreach(ef) { |l| l = l.chomp; next if l.strip.empty? || l.start_with?("#"); w, why, zh, ko = l.split("|", 4); EX[w] = [why.to_s, zh.to_s, ko.to_s] } }
GL = {}
File.foreach(src("gloss.txt")) { |l| a, b = l.chomp.split("|", 2); GL[a] = b if b }

# ---- 어떤 급수까지 만들지: 한국어 뜻이 모두 채워진 급수까지 ----
missing = Hash.new { |h, k| h[k] = [] }
words.each { |w| missing[w["lv"]] << w["w"] unless KW[w["w"]] }
max_lv = 0
(1..9).each { |lv| break unless words.any? { |w| w["lv"] == lv } && missing[lv].empty?; max_lv = lv }
words = words.select { |w| w["lv"] <= max_lv }

# ---- 번체: 단어의 간체/번체를 글자별로 맞춰서 얻음 ----
trad = {}
words.sort_by { |w| w["w"].size }.each do |w|
  s, t = w["w"].chars, w["t"].to_s.chars
  next unless s.size == t.size
  s.each_with_index { |c, i| trad[c] ||= t[i] }
end

def clean_pinyin(p, en)
  p = p.to_s.gsub(/\s+/, "")
  keep_cap = en.to_s =~ /\A[A-Z]/ && en !~ /\A(surname|abbr)/i
  keep_cap ? p : p.sub(/\A./) { |c| c.downcase }
end

out_words = words.map do |w|
  m, po = KW[w["w"]]
  [w["w"], po || clean_pinyin(w["p"], w["en"]), m, w["lv"]]
end

# ---- 한자 ----
def hun(c, kc); (kc[c] && kc[c]["k"]) || GL[c]; end
# 형성자(뜻 부분 + 소리 부분)는 유래를 자동으로 만든다
def auto_origin(d, kc)
  return nil unless d && d["type"] == "pictophonetic" && d["sem"] && d["pho"]
  sg = hun(d["sem"], kc).to_s.sub(/\s*\(.*\)\z/, "")
  pg = (D[d["pho"]] && D[d["pho"]]["py"] || PHO_PY[d["pho"]] || []).first
  sem = sg.empty? ? d["sem"] : "#{d['sem']}(#{sg})"
  pho = pg ? "#{d['pho']}(#{pg})" : d["pho"]
  "뜻은 #{sem}, 소리는 #{pho}에서 온 형성자."
end

chars = {}
words.each { |w| w["w"].each_char { |c| chars[c] ||= w["lv"] if c.ord.between?(0x3400, 0x9FFF) } }
need_gloss = {}
miss_c = []
out_h = {}
chars.each do |c, lv|
  kc = KC[c]; d = D[c] || {}
  unless kc then miss_c << c; next end
  parts = kc["p"] || d["dec"].to_s.gsub(/[⿰-⿻？]/, "").chars.uniq.reject { |x| x == c }
  t = kc["t"] || trad[c] || c
  o = kc["o"].to_s.empty? ? auto_origin(d, KC) : kc["o"]
  r = d["r"] || c
  ([r] + parts + [d["sem"], d["pho"]].compact).each { |x| need_gloss[x] = 1 unless x == c || KC[x] || GL[x] }
  out_h[c] = { "k" => "#{t} #{kc['k']}", "r" => r, "p" => parts, "o" => o.to_s, "m" => kc["m"].to_s, "lv" => lv,
               "s" => d["sem"], "f" => d["pho"], "y" => (d["py"] || []).first }.compact
end
gl = {}
out_h.each_value { |h| ([h["r"]] + h["p"]).each { |x| gl[x] = GL[x] if GL[x] && !out_h[x] } }

js = +"// 자동 생성 파일 — 직접 고치지 말고 src/ 를 고친 뒤 tools/build.rb 를 실행하세요.\n"
js << "// 단어 목록: complete-hsk-vocabulary (MIT, 2026 HSK 3.0 개정 기준) / 한자 분해: Make Me a Hanzi (LGPL)\n"
js << "// 한국어 뜻·훈음·유래·연상법: Claude 작성\n"
js << "window.LEVELS = #{(1..max_lv).to_a.to_json};\n"
js << "window.WORDS = [\n" << out_words.map(&:to_json).join(",\n") << "\n];\n"
js << "window.HANZI = {\n" << out_h.map { |c, h| "#{c.to_json}:#{h.to_json}" }.join(",\n") << "\n};\n"
js << "window.GLOSS = #{gl.to_json};\n"
# 구성 요소(부수·부품) 정보: 병음·분해·유래·외우는 법
CD = JSON.parse(File.read(src("comp-decomp.json")))
CK = {}
File.foreach(src("comp-ko.txt")) do |l|
  next if l.start_with?("#") || l.strip.empty?
  c, o, m = l.chomp.split("|", 3); CK[c] = [o, m]
end
comp = {}
CD.each do |c, v|
  parts = v["dec"].to_s.gsub(/[⿰-⿻？]/, "").chars.uniq.reject { |x| x == c }
  comp[c] = { "y" => v["py"], "p" => parts, "o" => (CK[c] || [])[0], "m" => (CK[c] || [])[1] }.compact
end
missing_ck = CD.keys - CK.keys
js << "window.COMP = #{comp.to_json};\n"
ex = EX.select { |w, _| out_words.any? { |x| x[0] == w } }

# ---- 예문 병음: HSK 단어 목록으로 가장 긴 단어부터 맞춰 나누고, 나머지는 글자 병음 ----
CPY = JSON.parse(File.read(src("char-pinyin.json")))
WPY = {}
out_words.each { |w, p, _m, _lv| WPY[w] = p.to_s.split(/,\s*/).first }
# 문법 조사·접미사는 경성으로
PARTICLE = { "的" => "de", "了" => "le", "着" => "zhe", "得" => "de", "么" => "me", "们" => "men",
             "吗" => "ma", "呢" => "ne", "吧" => "ba", "啊" => "a", "呀" => "ya", "子" => "zi" }
PUNCT = { "。" => ".", "，" => ",", "？" => "?", "！" => "!", "、" => ",", "：" => ":", "；" => ";",
          "“" => "\"", "”" => "\"", "（" => "(", "）" => ")", "……" => "…" }
MAXW = WPY.keys.map(&:size).max
WLV = {}; out_words.each { |w, _p, _m, lv| WLV[w] = lv }
TONE4 = "àèìòùǜ"
def is_han(c); c.ord.between?(0x3400, 0x9FFF); end
def char_tone4?(c); py = (CPY[c] || [""]).first.to_s; py.count(TONE4) > 0; end
# 한자 구간을 단어로 나눈다: 긴 단어를 우선하고, 같으면 낮은 급수 단어를 우선 (还有时间 → 还/有/时间)
def segment(cs)
  n = cs.size; best = Array.new(n + 1); best[n] = [0, []]
  (n - 1).downto(0) do |i|
    (1..[MAXW, n - i].min).each do |len|
      w = cs[i, len].join
      next unless len == 1 || WPY[w]
      sc = (len == 1 ? 1 : len * len * 10 - WLV[w].to_i) + best[i + len][0]
      best[i] = [sc, [w] + best[i + len][1]] if best[i].nil? || sc > best[i][0]
    end
  end
  best[0][1]
end
def sent_pinyin(s)
  # 1) 문장부호·외국 문자·한자 구간으로 나누기
  parts = []; buf = []
  flush = -> { parts << [:h, buf.dup] unless buf.empty?; buf.clear }
  s.each_char do |c|
    if is_han(c) then buf << c
    else flush.call; PUNCT[c] ? parts << [:p, PUNCT[c]] : (parts.last && parts.last[0] == :x ? parts.last[1] << c : parts << [:x, +c]) end
  end
  flush.call
  # 2) 단어별 병음
  toks = []
  parts.each do |kind, v|
    next toks << [kind, kind == :x ? v.strip : v] unless kind == :h
    words = segment(v); pos = 0
    words.each_with_index do |w, k|
      prev = k > 0 ? words[k - 1] : nil; nxt = words[k + 1]
      py = if w.size == 1 && w == "得" && (nxt&.start_with?("了") || %w[我 你 他 她 它 们].include?(prev.to_s[-1])) then "dé"
           elsif w.size == 1 && w == "子" && prev.nil? then "zǐ"
           elsif w.size == 1 && PARTICLE[w] then PARTICLE[w]
           elsif w == "地" && prev.to_s.size >= 2 then "de"         # 认真地, 高兴地
           elsif w == "个" && prev && "这那一几两每三四五六七八九十多".include?(prev[-1]) then "ge"
           elsif w == "一" && nxt && !"第十".include?(prev.to_s[-1].to_s) && !"月号日年点楼层".include?(nxt[0])
             char_tone4?(nxt[0]) ? "yí" : "yì"                     # 一下 yíxià, 一起 yìqǐ
           elsif w == "不" && nxt && char_tone4?(nxt[0]) then "bú"   # 不客气 bú kèqi
           elsif w == "过" && prev && prev.size == 1 && !PUNCT[prev] then "guo" # 去过 (경험)
           elsif w.size > 1 && w[0] == "一" && WPY[w].to_s.start_with?("yī") && !"月号日年".include?(w[1])
             WPY[w].sub(/\Ayī/, char_tone4?(w[1]) ? "yí" : "yì")   # 一起 yìqǐ, 一共 yígòng
           elsif w.size > 1 && w[0] == "不" && WPY[w].to_s.start_with?("bù") && char_tone4?(w[1])
             WPY[w].sub(/\Abù/, "bú")                               # 不要 búyào
           else WPY[w] || (CPY[w] || [w]).first end
      toks << [:w, py]; pos += w.size
    end
  end
  # 3) 이어 붙이기 (여는 따옴표 뒤·닫는 문장부호 앞은 띄우지 않음)
  out = +""; open_q = false
  toks.each do |kind, t|
    if kind == :p
      if t == "\"" then open_q = !open_q; out << (open_q ? " \"" : "\" ") else out << t << " " end
    else out << t << " " end
  end
  out = out.gsub(/\s+([.,?!:;…])/, '\1').gsub(/" +/, '"').gsub(/ +"(?=[.,?!\s]|\z)/, '"').gsub(/\s+/, " ").gsub(/""/, %q{" "}).gsub(/([.,?!…]) "(?= |\z)/, '\1"').strip
  up = ->(m) { m.upcase.tr("āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ", "ĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ") }
  out = out.sub(/\A("?)([a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü])/) { $1 + up.($2) }
  out.gsub(/([.?!]"?\s+"?)([a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü])/) { $1 + up.($2) }
end
ex = ex.to_h { |w, v| [w, v + [sent_pinyin(v[1])]] }
js << "window.EX = {\n" << ex.map { |w, v| "#{w.to_json}:#{v.to_json}" }.join(",\n") << "\n};\n"
File.write(File.join(ROOT, "data.js"), js)

puts "급수 1~#{max_lv}: 단어 #{out_words.size}개, 한자 #{out_h.size}자, 예문 #{ex.size}개"
(max_lv + 1..5).each { |lv| puts "  #{lv}급 뜻 없는 단어 #{missing[lv].size}개" unless missing[lv].empty? }
puts "  내용 없는 한자: #{miss_c.join}" unless miss_c.empty?
puts "  설명 없는 부품: #{missing_ck.join}" unless missing_ck.empty?
puts "  풀이 없는 구성요소: #{need_gloss.keys.join(' ')}" unless need_gloss.empty?
