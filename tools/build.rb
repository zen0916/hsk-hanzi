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
  out_h[c] = { "k" => "#{t} #{kc['k']}", "r" => r, "p" => parts, "o" => o.to_s, "m" => kc["m"].to_s, "lv" => lv }
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
ex = EX.select { |w, _| out_words.any? { |x| x[0] == w } }
js << "window.EX = {\n" << ex.map { |w, v| "#{w.to_json}:#{v.to_json}" }.join(",\n") << "\n};\n"
File.write(File.join(ROOT, "data.js"), js)

puts "급수 1~#{max_lv}: 단어 #{out_words.size}개, 한자 #{out_h.size}자, 예문 #{ex.size}개"
(max_lv + 1..5).each { |lv| puts "  #{lv}급 뜻 없는 단어 #{missing[lv].size}개" unless missing[lv].empty? }
puts "  내용 없는 한자: #{miss_c.join}" unless miss_c.empty?
puts "  풀이 없는 구성요소: #{need_gloss.keys.join(' ')}" unless need_gloss.empty?
