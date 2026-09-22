'use strict';
// 按图片数生成归一化区域，末行铺满，所有区域均位于画布内。
function collageLayout(count, mode, customRows = 2, customColumns = 2) {
  if (!count) return [];
  // 每行单独分列，行高等分；旧的统一列数配置仍兼容。
  if(mode === 'custom') {
    const columns=collageRowColumns(count,customRows,customColumns);
    return columns.flatMap((n,row)=>Array.from({length:n},(_,i)=>({x:i/n,y:row/columns.length,w:1/n,h:1/columns.length})));
  }
  if (mode === 'rows') return Array.from({length:count}, (_,i) => ({x:0,y:i/count,w:1,h:1/count}));
  if (mode === 'columns') return Array.from({length:count}, (_,i) => ({x:i/count,y:0,w:1/count,h:1}));
  if (mode === 'hero' && count > 1) return [{x:0,y:0,w:.6,h:1}, ...Array.from({length:count-1}, (_,i) => ({x:.6,y:i/(count-1),w:.4,h:1/(count-1)}))];
  const columns = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count/columns);
  return Array.from({length:count}, (_,i) => {
    const row = Math.floor(i/columns), inRow = Math.min(columns,count-row*columns);
    return {x:(i%columns)/inRow,y:row/rows,w:1/inRow,h:1/rows};
  });
}
// 规范化行列配置；独立列数容量不足时扩展最后一行，保留用户指定的行数。
function collageRowColumns(count, rows, columns) {
  rows=Math.max(1,Math.min(9,Math.floor(Number(rows))||1));
  const clamp=value=>Math.max(1,Math.min(9,Math.floor(Number(value))||1));
  if(!Array.isArray(columns)) {const n=clamp(columns);return Array(Math.max(rows,Math.ceil(count/n))).fill(n);}
  const result=Array.from({length:rows},(_,i)=>clamp(columns[i]??2));
  const missing=Math.max(0,count-result.reduce((sum,n)=>sum+n,0));
  result[result.length-1]+=missing;
  return result;
}
if (typeof module !== 'undefined') {module.exports=collageLayout;module.exports.rowColumns=collageRowColumns;}
