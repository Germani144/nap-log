# TEMPORARY: aggregate-only analysis, removed right after one run. Prints correlations/slopes/counts/minute offsets, never times or codes.
import json,os,sys,io,urllib.request,urllib.parse,datetime as dt,numpy as np
from scipy import stats
sys.stdout=io.StringIO()
KEY='AIzaSyDDKYM5tvjTixUdBq0BAd9-recAyoL6TE4';PID='nap-log-78cb6'
code=urllib.parse.quote(os.environ['FAMILY_CODE'],safe='')
base=f'https://firestore.googleapis.com/v1/projects/{PID}/databases/(default)/documents/families/{code}/entries'
E=[];tok=''
while True:
    j=json.load(urllib.request.urlopen(base+'?pageSize=300&key='+KEY+('&pageToken='+tok if tok else '')))
    for d in j.get('documents',[]):
        f=d['fields'];g=lambda k:(lambda v:None if v is None or 'nullValue' in v else int(v.get('integerValue',v.get('doubleValue',0))))(f.get(k))
        E.append({'type':f['type']['stringValue'],'start':g('start'),'end':g('end')})
    tok=j.get('nextPageToken')
    if not tok:break
loc=lambda ms:dt.datetime.fromtimestamp(ms/1000);mins=lambda t:t.hour*60+t.minute+t.second/60
D={}
for e in E:
    if not e['end']:continue
    s,en=loc(e['start']),loc(e['end'])
    if e['type']=='nap':D.setdefault(s.date(),{}).setdefault('naps',[]).append((mins(s),mins(en)))
    else:
        D.setdefault(en.date(),{})['wake']=mins(en)
        d=(s-dt.timedelta(days=1)).date() if s.hour<5 else s.date();b=mins(s)+(1440 if s.hour<5 else 0)
        D.setdefault(d,{})['bed']=b;D[d]['night']=(e['end']-e['start'])/6e4
R=[]
for d in sorted(D):
    x=D[d];y=D.get(d+dt.timedelta(days=1),{})
    if 'bed' in x and 'wake' in y and 'wake' in x and x.get('naps'):
        n=sorted(x['naps']);R.append(dict(d=d,bed=x['bed'],wake_next=y['wake'],night=x['night'],wake=x['wake'],napsum=sum(b-a for a,b in n),
            last_end=n[-1][1],gap=x['bed']-n[-1][1],n=len(n),awake=x['bed']-x['wake']-sum(b-a for a,b in n),firstwin=n[0][0]-x['wake']))
print('nights (bed D + wake D+1 + day D complete):',len(R),' since 15 Oct:',sum(r['d']>=dt.date(2026,10,15) for r in R))
def col(k):return np.array([r[k] for r in R],float)
def dev(k):
    v=col(k);o=np.full(len(v),np.nan)
    for i in range(len(v)):
        w=v[max(0,i-3):i+4]
        o[i]=v[i]-np.median(w)
    return o
def rep(name,x,y):
    m=~np.isnan(x)&~np.isnan(y);x,y=x[m],y[m];r,p=stats.pearsonr(x,y);rs,_=stats.spearmanr(x,y);sl=stats.linregress(x,y)
    print(f'{name:44s} n={len(x)} r={r:+.2f} (p={p:.3f}) rho={rs:+.2f} slope={sl.slope:+.2f}±{sl.stderr:.2f}')
W=col('wake_next');print('wake D+1 sd %.0f min; night length sd %.0f min; bedtime sd %.0f min'%(W.std(),col('night').std(),col('bed').std()))
print('== raw ==')
for k in ['bed','wake','napsum','last_end','gap','awake','n','firstwin']:rep('wake D+1 vs '+k+' (D)',col(k),W)
rep('night length vs bed',col('bed'),col('night'))
print('== detrended (vs the 7 days around) ==')
dW=dev('wake_next')
for k in ['bed','wake','napsum','last_end','gap','awake']:rep('dev wake D+1 vs dev '+k,dev(k),dW)
rep('dev night length vs dev bed',dev('bed'),dev('night'))
# multiple regression on deviations
X=np.column_stack([dev('bed'),dev('napsum'),dev('gap'),np.ones(len(R))]);b,res,_,_=np.linalg.lstsq(X,dW,rcond=None)
pred=X@b;r2=1-((dW-pred)**2).sum()/((dW-dW.mean())**2).sum()
print('multi: dev wake D+1 = %.2f*bed %+.2f*napsum %+.2f*gap  (R2=%.2f)'%(b[0],b[1],b[2],r2))
# terciles of bedtime deviation: mean wake/night deviation
dB=dev('bed');q=np.quantile(dB,[1/3,2/3])
for lab,m in [('earliest third',dB<=q[0]),('middle third',(dB>q[0])&(dB<=q[1])),('latest third',dB>q[1])]:
    print(f'bedtime {lab:15s}: bed {dB[m].mean():+5.0f} min vs usual -> wake D+1 {dW[m].mean():+5.0f} min, night {dev("night")[m].mean():+5.0f} min (n={m.sum()})')
dG=dev('gap');q=np.quantile(dG,[1/3,2/3])
for lab,m in [('shortest third',dG<=q[0]),('longest third',dG>q[1])]:
    print(f'last-nap-to-bed gap {lab:14s}: gap {dG[m].mean():+5.0f} -> wake D+1 {dW[m].mean():+5.0f} min (n={m.sum()})')
dN=dev('napsum');q=np.quantile(dN,[1/3,2/3])
for lab,m in [('least third',dN<=q[0]),('most third',dN>q[1])]:
    print(f'day nap total {lab:11s}: naps {dN[m].mean():+5.0f} -> wake D+1 {dW[m].mean():+5.0f} min, night {dev("night")[m].mean():+5.0f} (n={m.sum()})')
out=sys.stdout.getvalue().splitlines();sys.stdout=sys.__stdout__
ch,c=[],[]
for l in out:
    c.append(l)
    if len('%0A'.join(c))>3000:ch.append(c[:-1]);c=[l]
ch.append(c)
for c in ch:print('::notice::'+'%0A'.join(x.replace('%','%25') for x in c))
