const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('./layout.js');
test('所有布局支持 1–9 张图片，完整覆盖且不重叠', () => {
  for (const mode of ['grid','hero','rows','columns']) for(let count=1;count<=9;count++) {
    const cells=layout(count,mode);
    assert.equal(cells.length,count);
    assert.ok(Math.abs(cells.reduce((sum,b)=>sum+b.w*b.h,0)-1)<1e-9);
    for(const b of cells) assert.ok(b.x>=0&&b.y>=0&&b.w>0&&b.h>0&&b.x+b.w<=1+1e-9&&b.y+b.h<=1+1e-9);
    cells.forEach((a,i)=>cells.slice(i+1).forEach(b=>assert.ok(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)<1e-9||Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)<1e-9)));
  }
});
test('空素材没有单元格',()=>assert.deepEqual(layout(0,'grid'),[]));
test('custom grid keeps empty cells and expands rows',()=>{
  assert.equal(layout(3,'custom',2,3).length,6);
  assert.deepEqual(layout(3,'custom',2,3)[3],{x:0,y:.5,w:1/3,h:.5});
  assert.equal(layout(9,'custom',1,2).length,10);
  for(let rows=1;rows<=9;rows++)for(let columns=1;columns<=9;columns++){
    const cells=layout(9,'custom',rows,columns);
    assert.ok(cells.length>=9);
    assert.ok(Math.abs(cells.reduce((sum,b)=>sum+b.w*b.h,0)-1)<1e-9);
    for(const b of cells)assert.ok(b.x+b.w<=1+1e-9&&b.y+b.h<=1+1e-9);
  }
});
test('independent row columns preserve unequal widths and equal heights',()=>{
  const cells=layout(6,'custom',3,[1,2,3]);
  assert.equal(cells.length,6);
  assert.deepEqual(cells[0],{x:0,y:0,w:1,h:1/3});
  assert.deepEqual(cells[1],{x:0,y:1/3,w:.5,h:1/3});
  assert.deepEqual(cells[5],{x:2/3,y:2/3,w:1/3,h:1/3});
  assert.deepEqual(layout.rowColumns(9,2,[1,1]),[1,8]);
  assert.deepEqual(layout.rowColumns(3,1,[1,2,3]),[3]);
  assert.deepEqual(layout.rowColumns(0,3,[1]),[1,2,2]);
  for(const counts of [[1,2,3],[3,1],[2,3,1,2],[9,9,9]]) {
    const boxes=layout(9,'custom',counts.length,counts);
    assert.ok(boxes.length>=9);
    assert.ok(Math.abs(boxes.reduce((sum,b)=>sum+b.w*b.h,0)-1)<1e-9);
    boxes.forEach((a,i)=>boxes.slice(i+1).forEach(b=>assert.ok(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)<1e-9||Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)<1e-9)));
  }
});
