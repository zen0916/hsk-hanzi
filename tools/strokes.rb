# 획순 데이터 추출: ruby -Ku tools/strokes.rb <Make Me a Hanzi graphics.txt 경로>
# 앱에 들어 있는 한자만 strokes/<코드포인트>.json 으로 저장한다. (Arphic Public License)
require "json"
Encoding.default_external = "UTF-8"
ROOT = File.expand_path("..", __dir__)
chars = JSON.parse(File.read(File.join(ROOT, "src/hanzi-decomp.json")))["chars"].map { |x| x["c"] }
need = chars.to_h { |c| [c, 1] }
dir = File.join(ROOT, "strokes"); Dir.mkdir(dir) unless Dir.exist?(dir)
n = 0
File.foreach(ARGV[0]) do |l|
  j = JSON.parse(l); c = j["character"]
  next unless need.delete(c)
  File.write(File.join(dir, "#{c.ord.to_s(16)}.json"), JSON.generate({ "s" => j["strokes"], "m" => j["medians"] }))
  n += 1
end
puts "#{n}자 저장, 없는 글자: #{need.keys.join}"
