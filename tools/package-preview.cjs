const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets');
let html=fs.readFileSync(path.join(assets,'index.html'),'utf8');
html=html.replace("script-src 'self'","script-src 'self' 'unsafe-inline'");
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+fs.readFileSync(path.join(assets,'style.css'),'utf8')+'</style>');
for(const file of ['parser.js','app.js'])html=html.replace(`<script src="${file}"></script>`,()=>'<script>'+fs.readFileSync(path.join(assets,file),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
fs.writeFileSync(path.join(root,'BaoZhang-preview.html'),html);
console.log('Created BaoZhang-preview.html (browser demo with synthetic data).');
