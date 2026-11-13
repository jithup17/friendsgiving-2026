(() => {
  'use strict';
  const config = window.PARTY || {};
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const categories = ['Appetizer','Main','Side','Dessert'];
  const demo = !config.endpoint && config.preview === true;
  const endpointValid = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.endpoint || '');
  $$('[data-party]').forEach(el => {el.textContent = config[el.dataset.party] || '';});
  if (demo) $('#preview-note').hidden = false;
  $$('nav a').forEach(a => {if(a.getAttribute('href') === (location.pathname.split('/').pop() || 'index.html')) a.setAttribute('aria-current','page');});
  $$('.pun-card').forEach(button => button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    button.querySelector('.pun-reveal').hidden = expanded;
    button.querySelector('.pun-hint').textContent = expanded ? 'Tap for the recipe ↗' : 'Keep this one classified ↑';
  }));
  function message(el, text, error = false) {el.textContent = text;el.className = 'form-status ' + (error ? 'error' : 'ok');}
  function storageGet(key, fallback) {try {return JSON.parse(localStorage.getItem(key)) || fallback;}catch{return fallback;}}
  function storageSet(key, value) {localStorage.setItem(key,JSON.stringify(value));}
  const newId = () => crypto.randomUUID();
  function jsonp(params) {
    return new Promise((resolve,reject) => {
      if (!endpointValid) return reject(new Error('The host still needs to connect the forms.'));
      const callback = 'party_' + newId().replaceAll('-','');
      const script = document.createElement('script');
      const clean = () => {clearTimeout(timer);script.remove();delete window[callback];};
      const timer = setTimeout(() => {clean();reject(new Error('The sheet took too long to respond. Please try again.'));},20000);
      window[callback] = data => {clean();data.ok ? resolve(data) : reject(new Error(data.error || 'The sheet could not complete this request.'));};
      script.onerror = () => {clean();reject(new Error('Could not reach the sheet. Check your connection.'));};
      script.src = config.endpoint + '?' + new URLSearchParams({...params,callback,_:Date.now()});
      document.head.append(script);
    });
  }
  async function send(payload, status) {
    if (!endpointValid) throw new Error('The host still needs to connect the forms.');
    // Opaque POST alone cannot prove a save. Check a random, non-personal receipt afterward.
    await fetch(config.endpoint,{method:'POST',mode:'no-cors',body:new URLSearchParams({payload:JSON.stringify(payload)})});
    for(let attempt=0;attempt<5;attempt++) {
      const receipt = await jsonp({action:'receipt',id:payload.id});
      if(receipt.state === 'saved') return;
      if(receipt.state === 'rejected') throw new Error('The sheet rejected this entry. Please check the fields or contact the hosts.');
      message(status,'Waiting for the sheet to confirm your entry…');
      await new Promise(resolve => setTimeout(resolve,1500));
    }
    throw new Error('We could not confirm the save yet. Retry this form without changing it; the same entry will not be saved twice.');
  }
  function pendingPayload(key, data) {
    const saved = storageGet(key,null);
    const signature = JSON.stringify(data);
    const payload = saved && saved.signature === signature ? saved.payload : {...data,id:newId()};
    storageSet(key,{signature,payload});
    return payload;
  }
  const rsvp = $('#rsvp-form');
  if(rsvp) {
    const totalInput = rsvp.elements.total;
    function guestNames() {
      const container = $('#guest-names');
      const previous = [...container.querySelectorAll('input')].map(input => input.value);
      const total = Math.min(30,Math.max(1,Number(totalInput.value)||1));
      container.replaceChildren();
      for(let i=0;i<total;i++) {
        const label=document.createElement('label');label.textContent=`Guest ${i+1}${i===0?' (you)':''}`;
        const input=document.createElement('input');input.name='guestName';input.required=true;input.maxLength=80;
        input.value=previous[i] || (i===0?rsvp.elements.name.value:'');
        input.placeholder=i===0?'Your name':'Guest’s name';label.append(input);container.append(label);
      }
    }
    totalInput.addEventListener('input',guestNames);guestNames();
    function counts() {
      const attending = new FormData(rsvp).get('attending') === 'Yes';
      if(attending) guestNames();
      $('#guest-counts').hidden = !attending;
      $$('#guest-counts input').forEach(input => {input.disabled = !attending;});
    }
    $$('input[name=attending]').forEach(input => input.addEventListener('change',counts));counts();
    rsvp.addEventListener('submit',async event => {
      event.preventDefault();if(!rsvp.reportValidity()) return;
      const fd = new FormData(rsvp);if(fd.get('website')) return;
      const button = rsvp.querySelector('button[type=submit]');const status = $('#rsvp-status');
      const data = {action:'rsvp',name:fd.get('name').trim(),attending:fd.get('attending'),total:fd.get('attending')==='Yes'?Number(fd.get('total')):0,guestNames:fd.get('attending')==='Yes'?fd.getAll('guestName').map(name=>name.trim()):[],note:fd.get('note').trim()};
      if(!data.name) return message(status,'Please enter your name.',true);
      if(data.attending==='Yes' && (data.guestNames.length!==data.total || data.guestNames.some(name=>!name))) return message(status,'Please enter a name for every guest.',true);
      button.disabled=true;message(status,'Submitting your very important paperwork…');
      try {
        const payload = pendingPayload('pun-pending-rsvp',data);
        if(demo) storageSet('pun-demo-rsvp',data);else await send(payload,status);
        localStorage.removeItem('pun-pending-rsvp');rsvp.hidden=true;$('#rsvp-success').hidden=false;
        $('#success-title').textContent=data.attending==='Yes'?'You’re on the list.':'We’ll miss you.';
        $('#success-message').textContent=demo?'Preview complete! This RSVP is saved only in this browser. It has not been sent to the hosts.':data.attending==='Yes'?'The sheet has confirmed your RSVP. Magnus and Moose approve. Now claim your dish for the table.':'Your RSVP is confirmed. Sending you love (and a little judgment from the brothers).';
        if(data.attending==='No') $('#rsvp-success .button').hidden=true;
      } catch(error) {message(status,error.message,true);}finally {button.disabled=false;}
    });
  }
  const board = $('#dish-board');let dishes = [];let filter='All';let loading=false;
  const samples=[{name:'Example guest',dish:'Samosa chaat',category:'Appetizer',example:true},{name:'Example guest',dish:'Vegetable biryani',category:'Main',example:true},{name:'Example guest',dish:'Gulab jamun cheesecake',category:'Dessert',example:true}];
  function renderBoard() {
    board.replaceChildren();
    $('#dish-total').textContent = `${dishes.length} ${dishes.length===1?'dish':'dishes'} on the table` + (demo?' · preview examples included':'');
    const visible = dishes.filter(d => filter==='All' || d.category===filter);
    if(!visible.length) {
      const wrap=document.createElement('div');wrap.className='empty-state';
      const title=document.createElement('h3');title.textContent=filter==='All'?'The table is yours to start.':`Room for ${filter==='Side'?'sides':filter.toLowerCase()+'s'}.`;
      const p=document.createElement('p');p.textContent='Be the first to bring something delicious. Add your dish below.';wrap.append(title,p);board.append(wrap);return;
    }
    visible.forEach(d => {
      const card=document.createElement('article');card.className='dish-card';card.dataset.category=d.category;
      const cat=document.createElement('span');cat.className='category';cat.textContent=d.category;
      const title=document.createElement('h3');title.textContent=d.dish;
      const person=document.createElement('p');person.textContent='WITH LOVE, '+d.name;
      card.append(cat,title,person);
      if(d.example) {const label=document.createElement('span');label.className='demo-badge';label.textContent='EXAMPLE';card.append(label);}
      board.append(card);
    });
  }
  async function loadBoard() {
    if(loading) return;loading=true;const status=$('#board-status');const button=$('#refresh-board');button.disabled=true;
    message(status,'Setting the table…');
    try {
      dishes=demo?[...samples,...storageGet('pun-demo-dishes',[])]: (await jsonp({action:'board'})).dishes;
      renderBoard();message(status,demo?'Example dishes are for the preview. Your additions stay in this browser.':'Up to date. Everyone sees this shared table.');
    }catch(error){message(status,error.message,true);if(!board.children.length){const p=document.createElement('p');p.textContent='The shared table is unavailable right now. Please refresh or contact the hosts.';board.append(p);}}
    finally{loading=false;button.disabled=false;}
  }
  if(board) {
    $$('[data-filter]').forEach(button => button.addEventListener('click',()=>{filter=button.dataset.filter;$$('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});renderBoard();}));
    $('#refresh-board').addEventListener('click',loadBoard);loadBoard();
    let rowSerial=0;
    function addRow() {
      const rows=$('#dish-rows');if(rows.children.length>=10)return;
      const id=++rowSerial;const row=document.createElement('div');row.className='dish-row';
      row.innerHTML=`<div class="dish-row-header"><span>DISH <span class="row-number"></span></span><button type="button" class="remove-row" aria-label="Remove dish">Remove ×</button></div><div class="two-col"><label for="dish-${id}">Dish name<input id="dish-${id}" class="dish-name" required maxlength="100" placeholder="Your delicious contribution"></label><label for="category-${id}">Category<select id="category-${id}" class="dish-category" required><option value="">Choose one</option>${categories.map(c=>`<option>${c}</option>`).join('')}</select></label></div>`;
      row.querySelector('.remove-row').addEventListener('click',()=>{row.remove();numberRows();});rows.append(row);numberRows();
      if(rows.children.length>1)row.querySelector('input').focus();
    }
    function numberRows() {const rows=$$('.dish-row');rows.forEach((row,i)=>{row.querySelector('.row-number').textContent=String(i+1).padStart(2,'0');row.querySelector('.remove-row').hidden=rows.length===1;});$('#add-row').disabled=rows.length>=10;}
    $('#add-row').addEventListener('click',addRow);addRow();
    $('#dish-form').addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
      const fd=new FormData(form);if(fd.get('website'))return;
      const data={action:'dishes',name:fd.get('name').trim(),dishes:$$('.dish-row').map(row=>({dish:row.querySelector('.dish-name').value.trim(),category:row.querySelector('select').value}))};
      const status=$('#dish-status');if(!data.name || data.dishes.some(d=>!d.dish))return message(status,'Please enter your name and a name for every dish.',true);
      const button=form.querySelector('button[type=submit]');button.disabled=true;message(status,'Bringing your dishes to the table…');
      try {
        const payload=pendingPayload('pun-pending-dishes',data);
        if(demo)storageSet('pun-demo-dishes',[...storageGet('pun-demo-dishes',[]),...data.dishes.map(d=>({...d,name:data.name}))]);else await send(payload,status);
        localStorage.removeItem('pun-pending-dishes');form.reset();$('#dish-rows').replaceChildren();addRow();
        message(status,demo?'Added to this browser’s preview only. Nothing has been sent to the hosts.':'Confirmed! Your dishes are saved. Refresh the table above to see the latest menu.');
        await loadBoard();
      }catch(error){message(status,error.message,true);}finally{button.disabled=false;}
    });
  }
})();
