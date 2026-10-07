import subprocess, sys, os

src = open("index.html", encoding="utf8").read()
probe = """<script>window.__errs=[];addEventListener('error',e=>{__errs.push(e.message)});addEventListener('unhandledrejection',e=>{__errs.push(String(e.reason))});</script>"""
chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
cases = {
    "home": "",
    "open": "setTimeout(()=>{__fridge.snapOpen();},1200);",
    "shop": "setTimeout(()=>{document.getElementById('btnShop').click();},1500);",
    "board": "setTimeout(()=>{document.getElementById('btnShop').click();setTimeout(()=>document.querySelector('#shopTabs [data-tab=board]').click(),300);},1500);",
    "protein": "setTimeout(()=>{document.getElementById('btnShop').click();setTimeout(()=>document.querySelector('#shopTabs [data-tab=protein]').click(),300);},1500);",
    "town": "setTimeout(()=>{document.getElementById('btnShop').click();setTimeout(()=>document.querySelector('#shopTabs [data-tab=town]').click(),300);},1500);",
    "card": "setTimeout(()=>{__fridge.openCard('계란 30구');},1800);",
}
only = sys.argv[1:] or list(cases)
for name in only:
    js = cases[name]
    tail = f"<script>{js}setTimeout(()=>{{if(__errs.length){{document.body.insertAdjacentHTML('afterbegin','<pre style=\"position:fixed;z-index:99;background:red;color:#fff;top:0;left:0\">'+__errs.join('\\\\n')+'</pre>')}}}},3500);</script>"
    html = src.replace("<head>", "<head>" + probe, 1).replace("</body>", tail + "</body>", 1)
    fn = f"t_{name}.html"
    open(fn, "w", encoding="utf8").write(html)
    size = "1400,900"
    subprocess.run([chrome, "--headless=new", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--virtual-time-budget=6000", f"--window-size={size}", f"--screenshot={os.path.abspath('s_' + name + '.png')}", f"http://localhost:8765/{fn}"], capture_output=True, timeout=120)
    print(name, "done")
