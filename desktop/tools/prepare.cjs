const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{const root=path.resolve(__dirname,'..');await fs.mkdir(path.join(root,'models'),{recursive:true});const sums={};
for(const language of ['eng','chi_sim']){const target=path.join(root,'models',language+'.traineddata');try{await fs.access(target);}catch{const response=await fetch('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/'+language+'.traineddata');if(!response.ok)throw Error('OCR model download '+response.status);await fs.writeFile(target,Buffer.from(await response.arrayBuffer()));}
const bytes=await fs.readFile(target);if(bytes.length<100000)throw Error('Incomplete OCR model');sums[language]=crypto.createHash('sha256').update(bytes).digest('hex');}
await fs.writeFile(path.join(root,'models','sha256.json'),JSON.stringify(sums,null,2));
console.log('Offline English and Chinese OCR models ready.');
})().catch(e=>{console.error(e);process.exit(1)});