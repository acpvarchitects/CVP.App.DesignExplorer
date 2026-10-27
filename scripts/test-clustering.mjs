import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
// Repository is intentionally build-free; import its ES module without changing package type.
const source = await readFile(new URL('../v2/clustering.js',import.meta.url),'utf8');
const { optionKey, readGeneration, generationScope, scaleVectors, kmeans, representatives } = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const check = (name,fn) => { fn(); console.log('PASS '+name); };
const manifest={version:1,feature_space:'test-v1',features:['x','y'],key_column:'option',join_column:'in:Index',scaling:'standardize'};
const table=rows=>Object.assign(rows,{columns:['option','x','y']});
check('strict vectors, canonical ID, duplicate and blank rejection',()=>{
    assert.equal(optionKey('01.0'),'1');
    assert.deepEqual(readGeneration(table([{option:'1',x:'0',y:'2'}]),manifest).vectors.get('1'),[0,2]);
    assert.throws(()=>readGeneration(table([{option:'1',x:'',y:'2'}]),manifest));
    assert.throws(()=>readGeneration(table([{option:'1',x:'0',y:'2'},{option:'1.0',x:'1',y:'2'}]),manifest));
});
check('cross-batch join uses study + local ID; incompatible and missing rows fail',()=>{
    const a={name:'A',generation:readGeneration(table([{option:'1',x:'0',y:'2'}]),manifest)};
    const b={name:'B',generation:readGeneration(table([{option:'1',x:'10',y:'2'}]),manifest)};
    const options=[a,b].map(study=>({study,row:{'in:Index':'1'}}));
    assert.deepEqual(generationScope(options).points.map(p=>p.vector),[[0,2],[10,2]]);
    b.generation.signature='different';assert.throws(()=>generationScope(options));
    assert.throws(()=>generationScope([{study:a,row:{'in:Index':'404'}}]));
});
check('joint scaling ignores constants and is invariant to measurement units',()=>{
    assert.deepEqual(scaleVectors([[1,0,7],[3,100,7]],'standardize').map(v=>Array.from(v)),[[-1,-1],[1,1]]);
    assert.deepEqual(scaleVectors([[1],[3]],'none').map(v=>Array.from(v)),[[-1],[1]]);
});
check('deterministic, separated clusters, no mutation, duplicate cap',()=>{
    const x=[[0],[0],[0.1],[10],[10.1],[10.1]], saved=JSON.stringify(x);
    const a=kmeans(x,2), b=kmeans(x,2);
    assert.deepEqual(a,b);assert.equal(JSON.stringify(x),saved);
    assert.deepEqual(a.clusters.map(c=>c.members.length).sort(),[3,3]);
    assert.equal(kmeans([[1],[1],[1]],8).clusters.length,1);
    assert.equal(kmeans([[0],[1],[2]],9).clusters.length,3);
    assert.equal(kmeans([],5).clusters.length,0);
    assert.equal(kmeans([[],[]],3).clusters.length,1);
    assert.throws(()=>kmeans(x,0));
});
check('closest real option; higher/lower best; score ties use centroid; missing-score fallback',()=>{
    const vectors=[[0],[1],[10]], options=vectors.map((v,i)=>({index:i,values:{score:[5,7,20][i]}}));
    const points=options.map(option=>({option})), result=kmeans(vectors,1);
    assert.equal(representatives(result,points,vectors).clusters[0].representative.index,1);
    assert.equal(representatives(result,points,vectors,{col:'score',dir:1}).clusters[0].representative.index,2);
    assert.equal(representatives(result,points,vectors,{col:'score',dir:-1}).clusters[0].representative.index,0);
    options.forEach(o=>o.values.score=5);
    assert.equal(representatives(result,points,vectors,{col:'score',dir:1}).clusters[0].representative.index,1);
    options.forEach(o=>o.values.score=NaN);
    assert.equal(representatives(result,points,vectors,{col:'score',dir:1}).fallbacks,1);
});

const app = await readFile(new URL('../v2/app.js',import.meta.url),'utf8');
check('actual app view keeps cluster base fixed under filters, including zero results and methods',()=>{
    // Run the real orchestration functions, replacing only unrelated chart/stat helpers.
    const a={name:'A'},b={name:'B'};
    for (const study of [a,b]) study.generation=readGeneration(table([
        {option:'1',x:study===a?'0':'9',y:'0'},
        {option:'2',x:study===a?'1':'10',y:'0'},
    ]),manifest);
    const options=[a,a,b,b].map((study,index)=>({index,study,row:{'in:Index':String(index%2+1)},values:{score:index%2?100:0}}));
    const state={clustering:true,clusterMethods:[],clusterK:2,clusterMode:'centroid',methods:new Set()};
    let allowed=null;
    const context=vm.createContext({state,data:{options},generationScope,scaleVectors,kmeans,representatives,
        inMethod:o=>!state.methods.size||state.methods.has(o.study.name),passes:o=>!allowed||allowed.has(o.index),
        ordered:x=>x,computeStats:()=>({}),rankGoals:()=>[],goals:()=>[],
        clusterMetricByCol:col=>({col,dir:1})});
    context.data.schema={outputs:[]};
    const code=app.slice(app.indexOf('function computeView()'),app.indexOf('function renderClustering('));
    vm.runInContext(code,context);
    const view=()=>vm.runInContext('computeView()',context);
    const ids=v=>Array.from(v.visible,o=>o.index);
    const initial=view(),selected=Array.from(initial.clustering.selected,o=>o.index);
    assert.equal(selected.length,2);
    const originalFit=vm.runInContext('clusteringCache.value',context);
    const excluded=selected[0];allowed=new Set(options.map(o=>o.index).filter(i=>i!==excluded));
    assert.deepEqual(ids(view()),selected.filter(i=>i!==excluded)); // no replacement from its cluster
    assert.equal(vm.runInContext('clusteringCache.value',context),originalFit);
    allowed=new Set();assert.equal(view().visible.length,0);
    assert.equal(view().clustering.selected.size,2); // empty range never destroys the base
    allowed=null;assert.deepEqual(ids(view()),selected);
    state.methods.add('B');assert.deepEqual(ids(view()),selected.filter(i=>options[i].study===b));
    assert.equal(vm.runInContext('clusteringCache.value',context),originalFit);
    state.methods.clear();assert.deepEqual(ids(view()),selected);
    state.clusterMode='best';state.clusterMetric='score';
    const best=view();assert.ok(ids(best).every(i=>i%2===1));
    allowed=new Set([0,2]);assert.equal(view().visible.length,0); // no fallback to a worse passing member
    assert.equal(vm.runInContext('clusteringCache.value',context),originalFit);
});
