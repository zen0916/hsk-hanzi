# 예문 파일 점검: ruby -Ku tools/excheck.rb <급수>
lv = ARGV[0].to_i
words = File.read(File.expand_path("../data.js", __dir__))[/window\.WORDS = \[(.*?)\n\];/m, 1].scan(/\["([^"]+)","[^"]*","[^"]*",(\d)\]/).select { |w, l| l.to_i == lv }.map(&:first)
f = File.expand_path("../src/ex-L#{lv}.txt", __dir__)
lines = File.readlines(f).map(&:chomp).reject { |l| l.start_with?("#") || l.strip.empty? }
bad = lines.reject { |l| l.count("|") == 3 }
have = lines.map { |l| l.split("|")[0] }
nohit = lines.select { |l| w, _, zh = l.split("|"); zh && !zh.include?(w) }
puts "형식 오류: #{bad.size} #{bad.first(3)}", "빠진 단어(#{(words - have).size}): #{(words - have).join(' ')}", "목록에 없는 단어: #{(have - words).join(' ')}", "예문에 단어 없음: #{nohit.map { |l| l.split('|')[0] }.join(' ')}"
