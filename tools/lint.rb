# 한국어 내용 자동 점검: ruby -Ku tools/lint.rb
require "json"
Encoding.default_external = "UTF-8"
ROOT = File.expand_path("..", __dir__)
dec = JSON.parse(File.read(File.join(ROOT, "src/hanzi-decomp.json")))["chars"].to_h { |x| [x["c"], x] }
words = JSON.parse(File.read(File.join(ROOT, "src/hsk-words.json")))
KC = {}; KW = {}
([File.join(ROOT, "src/ko-legacy.txt")] + Dir[File.join(ROOT, "src/ko-L*.txt")].sort).each do |f|
  mode = nil
  File.foreach(f) do |l|
    l = l.chomp; next if l.strip.empty?
    (mode = l; next) if l.start_with?("@")
    if mode == "@w" then w, m, p = l.split("\t"); KW[w] = [m, p, File.basename(f)]
    else c, k, o, m, t, parts = l.split("|", -1); KC[c] = { "k" => k, "o" => o, "m" => m, "f" => File.basename(f), "p" => parts } end
  end
end
han = ->(s) { s.to_s.scan(/[⺀-⿟㐀-鿿]/) }
issues = Hash.new { |h, k| h[k] = [] }
KC.each do |c, e|
  issues["훈음 형식"] << "#{c}|#{e['k']}" unless e["k"] =~ /\A\S.*\s[가-힣]{1,2}(\/[가-힣]+)?( \(.*\))?\z/ || e["k"] =~ /\A.+ [가-힣]+\z/
  d = dec[c] || {}
  ok = han.(d["dec"]) + [c, d["r"], d["sem"], d["pho"]].compact + han.(e["p"]) + han.(e["k"])
  odd = han.(e["m"]) - ok
  issues["연상법에 구성에 없는 글자"] << "#{c} [#{han.(d['dec']).join}] #{odd.uniq.join} :: #{e['m']}" unless odd.empty?
end
words.each do |w|
  m, p, = KW[w["w"]]
  issues["뜻에 영문/숫자"] << "#{w['w']} #{m}" if m =~ /[A-Za-z0-9]/ && m !~ /QR|SMS/
  pp = p || w["p"]
  issues["병음 이상"] << "#{w['w']} #{pp}" if pp =~ /[0-9]/
end
issues.each { |k, v| puts "== #{k} (#{v.size})"; v.each { |x| puts x } }
