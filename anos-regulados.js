/* Valores regulados por ano: TAR, tarifa regulada, tarifa social (eletricidade e gás) e perfis de perdas.
 *
 * Cada ano (ou período) é um bloco no HTML:
 *   <div class="ano-bloco" data-ano="2026-2027" data-rotulo="2026-2027" data-de="2026-10-01" data-ate="2027-09-30">…</div>
 *   data-ate pode faltar (sem fim conhecido); data-pendente="15/12/2026" marca um bloco ainda sem valores.
 * e o seletor nasce aqui, dentro de <div class="anos-reg" data-titulo="Ano" data-ficheiro="TAR_BTN"></div>.
 *
 * - Abre no bloco em vigor pela data de hoje em Portugal: no dia em que um ano novo entra em vigor, a página
 *   muda sozinha, sem ser preciso publicar nada. ?ano=<data-ano> abre outro; &comparar=<data-ano> abre já comparado.
 * - O HTML já traz os outros blocos com hidden (sem JavaScript vê-se o que estava em vigor ao publicar).
 * - «Comparar com …» (desligado por omissão): escolhe-se qualquer bloco anterior (com mais de uma alteração no
 *   mesmo ano, compara-se com a anterior ou com o ano antes). Os preços são as células com 3 ou mais casas
 *   decimais (as potências e os escalões têm menos) e emparelham-se pela ordem; só se oferecem os blocos com o
 *   mesmo número de preços. As variações têm cor pelo lado de quem paga: subida a vermelho e descida a verde,
 *   ao contrário nas tabelas de desconto (o título tem «DESCONTO»); sem alteração, sem cor. O sinal e a seta
 *   ficam sempre, para não depender só da cor.
 *   Nas tabelas com um preço por linha, na última coluna, a tabela ganha 3 colunas (preço anterior, variação
 *   absoluta e relativa); nas outras (o gás tem termo fixo e energia na mesma linha), a variação vai na célula.
 * - Entre tabelas do mesmo bloco e por baixo da última, o endereço da página (como o .link-section do resto do site), para que quem
 *   recorte uma tabela leve o endereço; entra também na imagem.
 * - «Guardar imagem»: PNG do bloco à vista (título, logótipo, endereço e tabelas; com a comparação, se ligada),
 *   sempre no tema claro e com a largura do computador, para publicar nas redes sociais. Usa o html2canvas,
 *   carregado só no primeiro clique.
 */
(function () {
    'use strict';
    const raiz = document.querySelector('.anos-reg');
    const blocos = [...document.querySelectorAll('.ano-bloco')]
        .sort((a, b) => (a.dataset.de < b.dataset.de ? -1 : a.dataset.de > b.dataset.de ? 1 : 0));
    if (!raiz || !blocos.length) return;   // com um só bloco: sem seletor, mas com o botão da imagem

    // ---------- estilos (os mesmos nas 7 páginas) ----------
    const css = document.createElement('style');
    css.textContent = `
        .anos-reg { max-width: 900px; margin: 22px auto 0 auto; text-align: center; }
        .anos-botoes { display: inline-flex; flex-wrap: wrap; justify-content: center; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; }
        .anos-botoes button { background: #fff; border: none; border-right: 1px solid #cbd5e1; padding: 7px 16px; font-size: 0.95em; cursor: pointer; color: #334155; line-height: 1.25; font-family: inherit; }
        .anos-botoes button:last-child { border-right: none; }
        .anos-botoes button:hover:not(.ativo) { background: #f1f5f9; }
        .anos-botoes button.ativo { background: #2563eb; color: #fff; font-weight: 600; }
        .anos-botoes .ano-estado { display: block; font-size: 0.74em; font-weight: normal; }
        .anos-aviso { max-width: 900px; margin: 12px auto 0 auto; padding: 9px 13px; border-left: 3px solid #2563eb; background: #eff6ff; border-radius: 0 5px 5px 0; text-align: left; font-size: 0.92em; color: #1e293b; }
        .anos-aviso.pendente { border-left-color: #a16207; background: #fefce8; }
        .anos-aviso button { background: none; border: none; padding: 0; margin-left: 4px; color: #1d4ed8; text-decoration: underline; cursor: pointer; font: inherit; }
        .anos-acoes { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px 22px; margin-top: 12px; font-size: 0.9em; }
        .anos-var { display: inline-flex; align-items: center; gap: 7px; }
        .anos-var select { font: inherit; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; color: #1e293b; }
        .anos-var[hidden], .anos-img[hidden], .anos-botoes[hidden], .anos-acoes[hidden] { display: none; }
        .anos-img { background: #fff; border: 1px solid #cbd5e1; border-radius: 5px; padding: 5px 12px; cursor: pointer; color: #334155; font: inherit; }
        .anos-img:hover { background: #f1f5f9; }
        .anos-img:disabled { opacity: 0.6; cursor: wait; }
        .ano-delta { display: block; font-size: 0.74em; font-weight: normal; color: #475569; white-space: nowrap; margin-top: 1px; line-height: 1.35; }
        .anos-col { white-space: nowrap; }
        .ano-bloco td.anos-pior, .ano-bloco .anos-pior { color: #b42318; font-weight: 600; }
        .ano-bloco td.anos-melhor, .ano-bloco .anos-melhor { color: #166534; font-weight: 600; }
        [data-theme="dark"] .ano-bloco td.anos-pior, [data-theme="dark"] .ano-bloco .anos-pior { color: #fca5a5; }   /* o #f87171 do style.css fica a 3,7:1 no cinzento das tabelas */
        [data-theme="dark"] .ano-bloco td.anos-melhor, [data-theme="dark"] .ano-bloco .anos-melhor { color: var(--txt-verde, #4ade80); }
        .anos-ano { display: block; font-size: 0.85em; }
        .ano-bloco.comparar { overflow-x: auto; }
        .ano-bloco .link-section.anos-link { margin: 16px auto; }
        [data-theme="dark"] .anos-botoes { border-color: #475569; }
        [data-theme="dark"] .anos-botoes button { background: #1e293b; color: #cbd5e1; border-right-color: #475569; }
        [data-theme="dark"] .anos-botoes button:hover:not(.ativo) { background: #334155; }
        [data-theme="dark"] .anos-botoes button.ativo { background: #2563eb; color: #fff; }
        [data-theme="dark"] .anos-aviso { background: #172554; color: #e2e8f0; border-left-color: #60a5fa; }
        [data-theme="dark"] .anos-aviso.pendente { background: #3b2f0b; border-left-color: #fbbf24; }
        [data-theme="dark"] .anos-aviso button { color: #93c5fd; }
        [data-theme="dark"] .anos-img, [data-theme="dark"] .anos-var select { background: #1e293b; color: #cbd5e1; border-color: #475569; }
        [data-theme="dark"] .anos-img:hover { background: #334155; }
        [data-theme="dark"] .ano-delta { color: #cbd5e1; }
    `;
    document.head.appendChild(css);

    // ---------- datas ----------
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const fmt = iso => iso ? iso.split('-').reverse().join('/') : '';
    const pendente = b => b.hasAttribute('data-pendente');
    const estado = b => {
        const de = b.dataset.de, ate = b.dataset.ate || '';
        if (de > hoje) return 'futuro';
        if (ate && ate < hoje) return 'passado';
        return 'vigor';
    };
    // Em vigor: o mais recente que já começou e não acabou (e tem valores)
    const emVigor = blocos.filter(b => estado(b) === 'vigor' && !pendente(b)).pop()
        || blocos.filter(b => b.dataset.de <= hoje && !pendente(b)).pop() || blocos[0];
    const estadoDe = b => (b === emVigor ? 'vigor' : (estado(b) === 'vigor' ? 'passado' : estado(b)));
    function isoAntes(iso) {
        const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
    }
    const textoEstado = b => {
        const e = estadoDe(b);
        if (e === 'vigor') return 'em vigor';
        if (e === 'futuro') return pendente(b) ? 'por publicar' : `a partir de ${fmt(b.dataset.de)}`;
        const seg = blocos[blocos.indexOf(b) + 1];
        const ate = b.dataset.ate || (seg ? isoAntes(seg.dataset.de) : '');
        return ate ? `até ${fmt(ate)}` : 'anterior';
    };

    // ---------- preços ----------
    const RE_PRECO = /^-?\d+,\d{3,}$/;
    // O valor da célula, sem a variação que lá se junta (.ano-delta); as colunas da comparação (.anos-col)
    // não contam como preços, embora também os tenham
    const valor = td => [...td.childNodes].filter(n => !(n.nodeType === 1 && n.classList.contains('ano-delta')))
        .map(n => n.textContent).join('').trim();
    const ePreco = td => td && td.tagName === 'TD' && !td.classList.contains('anos-col') && RE_PRECO.test(valor(td));
    const precos = b => [...b.querySelectorAll('td')].filter(ePreco);
    const num = td => parseFloat(valor(td).replace(',', '.'));
    const casas = td => (valor(td).split(',')[1] || '').length;
    const fmtN = (v, d) => new Intl.NumberFormat('pt-PT', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false }).format(v);
    const comSinal = (v, d) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmtN(Math.abs(v), d);
    // Blocos com que se pode comparar: os anteriores com valores e o mesmo número de preços (o mais recente 1.º)
    const anterioresDe = b => {
        if (pendente(b)) return [];
        const n = precos(b).length;
        return n ? blocos.slice(0, blocos.indexOf(b)).filter(a => !pendente(a) && precos(a).length === n).reverse() : [];
    };
    // Colunas: cada linha com preço tem um só, e é a última célula
    const emColunas = b => [...b.querySelectorAll('tr')].every(tr => {
        const n = [...tr.children].filter(ePreco).length;
        return n === 0 || (n === 1 && ePreco(tr.lastElementChild));
    });
    const variacao = (v, a, d) => {
        if (!isFinite(v) || !isFinite(a)) return null;
        // Relativa sobre o valor absoluto do anterior: com valores negativos (a tarifa social de acesso tem
        // alguns), passar de −0,0335 para −0,0310 é uma subida
        return { abs: comSinal(v - a, d), rel: a === 0 ? (v === 0 ? '0,00 %' : '—') : comSinal((v - a) / Math.abs(a) * 100, 2) + ' %' };
    };

    // Classe da cor: pior (subida, ou descida nas tabelas de desconto), melhor, ou nenhuma
    const eDesconto = tabela => /DESCONTO/i.test((tabela && tabela.rows[0] ? tabela.rows[0].textContent : ''));
    const classeCor = (v, a, tabela) => {
        if (!isFinite(v) || !isFinite(a) || v === a) return '';
        const subiu = v > a;
        return (subiu !== eDesconto(tabela)) ? 'anos-pior' : 'anos-melhor';
    };

    // ---------- comparação ----------
    function limparComparacao() {
        document.querySelectorAll('.ano-delta, .anos-col, .anos-ano').forEach(e => e.remove());
        blocos.forEach(b => b.classList.remove('comparar'));
    }
    function comparar(b, ant) {
        limparComparacao();
        if (!ant) return;
        const q = precos(ant), rotA = ant.dataset.rotulo, rot = b.dataset.rotulo;
        let k = 0;
        if (!emColunas(b)) {
            // Na célula: o valor anterior e a variação
            precos(b).forEach((td, i) => {
                const a = q[i], x = variacao(num(td), num(a), Math.max(casas(td), casas(a)));
                if (!x) return;
                const s = document.createElement('span');
                s.className = 'ano-delta';
                const cor = classeCor(num(td), num(a), td.closest('table'));
                s.innerHTML = `${rotA}: ${valor(a)}<br><span class="${cor}">${x.abs} (${x.rel})</span>`;
                td.appendChild(s);
            });
            return;
        }
        b.classList.add('comparar');
        const novo = (tag, txt, cls, extra) => {
            const c = document.createElement(tag);
            c.className = 'anos-col' + (cls ? ' ' + cls : '');
            c.innerHTML = txt;
            if (extra) Object.entries(extra).forEach(([n, v]) => c.setAttribute(n, v));
            return c;
        };
        b.querySelectorAll('table').forEach(tabela => {
            let unidade = '';
            tabela.querySelectorAll('tr').forEach(tr => {
                const ult = tr.lastElementChild;
                if (!ult) return;
                if (ult.tagName === 'TH') {
                    const t = ult.textContent.trim();
                    if (/PREÇOS/i.test(t)) {
                        const ano = document.createElement('span'); ano.className = 'anos-ano'; ano.textContent = rot;
                        ult.appendChild(ano);
                        tr.append(novo('th', `${t}<span class="anos-ano">${rotA}</span>`, '', { scope: 'col' }),
                                  novo('th', `Variação<span class="anos-ano">${rot} vs ${rotA}</span>`, '', { scope: 'colgroup', colspan: '2' }));
                    } else if (/EUR\//i.test(t)) {
                        unidade = t.replace(/^EUR/i, '€').replace(/\s+/g, '');
                        tr.append(novo('th', t, '', { scope: 'col' }), novo('th', 'Absoluta', '', { scope: 'col' }), novo('th', 'Relativa', '', { scope: 'col' }));
                    } else {
                        tr.append(novo('th', ''), novo('th', ''), novo('th', ''));
                    }
                    return;
                }
                if (!ePreco(ult)) return;
                const a = q[k++], x = variacao(num(ult), num(a), Math.max(casas(ult), casas(a)));
                const cls = ult.className, cor = classeCor(num(ult), num(a), tabela);
                tr.append(novo('td', valor(a), cls),
                          novo('td', x ? `${x.abs} ${unidade}` : '—', (cls + ' ' + cor).trim()),
                          novo('td', x ? x.rel : '—', (cls + ' ' + cor).trim()));
            });
        });
    }

    // ---------- imagem (PNG) ----------
    let _h2c = null;
    function carregarH2C() {
        if (window.html2canvas) return Promise.resolve();
        if (!_h2c) _h2c = new Promise((ok, erro) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            // SRI, como nos outros scripts de CDN do site (sha512 igual ao publicado pelo cdnjs, verificado a 24/11)
            s.integrity = 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H';
            s.crossOrigin = 'anonymous';
            s.onload = ok; s.onerror = () => { _h2c = null; erro(new Error('html2canvas')); };
            document.head.appendChild(s);
        });
        return _h2c;
    }
    function paraDados(src) {
        return fetch(src).then(r => (r.ok ? r.blob() : null)).then(b => b && new Promise(ok => {
            const fr = new FileReader();
            fr.onload = () => ok(fr.result);
            fr.onerror = () => ok(null);
            fr.readAsDataURL(b);
        })).catch(() => null);
    }
    async function guardarImagem() {
        const b = atual, ant = comparadoCom();
        const alvo = b.querySelector('[class$="-wrapper"]') || b;
        btImg.disabled = true;
        const texto = btImg.textContent;
        btImg.textContent = 'A preparar…';
        try {
            await carregarH2C();
            // As imagens do bloco (o logótipo) vão embutidas na cópia: em alguns browsers a cópia do html2canvas
            // ainda não as tinha carregado e o logótipo faltava na imagem
            const imgs = [...alvo.querySelectorAll('img')];
            const dados = await Promise.all(imgs.map(i => paraDados(i.currentSrc || i.src)));
            alvo.setAttribute('data-captura', '1');
            const canvas = await window.html2canvas(alvo, {
                scale: 2, backgroundColor: '#ffffff', windowWidth: Math.max(1200, (+alvo.dataset.largura || 0) + 100), useCORS: true, logging: false,
                onclone: doc => {
                    doc.documentElement.setAttribute('data-theme', 'light');
                    const w = doc.querySelector('[data-captura]');
                    if (!w) return;
                    // Largura da imagem: a do wrapper (data-largura) ou 900 px (1150 com as colunas da comparação)
                    w.style.width = (+w.dataset.largura || ((ant && b.classList.contains('comparar')) ? 1150 : 900)) + 'px';
                    w.querySelectorAll('[class$="-rolo"]').forEach(e => { e.style.overflow = 'visible'; });
                    w.style.maxWidth = 'none';
                    w.style.margin = '0';
                    w.style.padding = '18px 22px';
                    w.style.background = '#ffffff';
                    w.querySelectorAll('.sr-only').forEach(e => e.remove());
                    w.querySelectorAll('img').forEach((im, k) => {
                        if (!dados[k]) return;
                        im.removeAttribute('srcset'); im.removeAttribute('loading');
                        im.src = dados[k];
                    });
                    // O html2canvas pinta o fundo de cada <tr> por cima das células que ocupam várias linhas
                    // (rowspan): o fundo passa da linha para as células dela
                    const vazio = c => !c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
                    w.querySelectorAll('tr').forEach(tr => {
                        const bg = doc.defaultView.getComputedStyle(tr).backgroundColor;
                        if (vazio(bg)) return;
                        [...tr.children].forEach(c => { if (vazio(doc.defaultView.getComputedStyle(c).backgroundColor)) c.style.backgroundColor = bg; });
                        tr.style.backgroundColor = 'transparent';
                    });
                    const tit = w.querySelector('[class$="-title"]');
                    if (tit && ant) tit.innerHTML = `Comparação ${tit.textContent.trim()}<br>${b.dataset.rotulo} vs ${ant.dataset.rotulo}`;
                }
            });
            const nome = `${raiz.dataset.ficheiro || 'tabela'}_${b.dataset.ano}${ant ? '_vs_' + ant.dataset.ano : ''}.png`;
            await new Promise(ok => canvas.toBlob(blob => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob); a.download = nome;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 5000);
                ok();
            }, 'image/png'));
        } catch (e) {
            console.error('Guardar imagem:', e);
            alert('Não foi possível criar a imagem. Tente novamente.');
        } finally {
            alvo.removeAttribute('data-captura');
            btImg.disabled = false;
            btImg.textContent = texto;
        }
    }

    // ---------- endereço da página entre as tabelas e por baixo da última ----------
    const canon = document.querySelector('link[rel="canonical"]');
    const endereco = (canon && canon.href) || (location.origin + location.pathname);
    const novaLigacao = () => {
        const d = document.createElement('div');
        d.className = 'link-section anos-link';
        const p = document.createElement('p');
        p.textContent = endereco;
        d.appendChild(p);
        return d;
    };
    // A tabela, ou a caixa que a faz deslizar no telemóvel (.pp-rolo)
    const caixaDe = tab => (tab.parentElement && /-rolo\b/.test(tab.parentElement.className) ? tab.parentElement : tab);
    blocos.forEach(b => {
        const tabs = [...b.querySelectorAll('table')];
        tabs.slice(1).forEach(tab => {
            const c = caixaDe(tab), antes = c.previousElementSibling;
            if (antes && antes.tagName === 'BR') antes.replaceWith(novaLigacao()); else c.before(novaLigacao());
        });
        if (tabs.length) {
            const c = caixaDe(tabs[tabs.length - 1]), depois = c.nextElementSibling;
            if (depois && depois.tagName === 'BR') depois.replaceWith(novaLigacao()); else c.after(novaLigacao());
        }
    });

    // ---------- seletor, aviso, comparação e imagem ----------
    raiz.innerHTML = '';
    const grupo = document.createElement('div');
    grupo.className = 'anos-botoes';
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-label', raiz.dataset.titulo || 'Ano');
    blocos.forEach(b => {
        const bt = document.createElement('button');
        bt.type = 'button';
        bt.dataset.ano = b.dataset.ano;
        bt.innerHTML = `${b.dataset.rotulo}<span class="ano-estado">${textoEstado(b)}</span>`;
        grupo.appendChild(bt);
    });
    const aviso = document.createElement('div');
    aviso.className = 'anos-aviso';
    aviso.setAttribute('role', 'status');
    const acoes = document.createElement('div');
    acoes.className = 'anos-acoes';
    const caixa = document.createElement('label');
    caixa.className = 'anos-var';
    caixa.innerHTML = 'Comparar com <select></select>';
    const sel = caixa.querySelector('select');
    let alvo = new URLSearchParams(window.location.search).get('comparar') || '';   // data-ano escolhido, ou ''
    const comparadoCom = () => (sel.value ? blocos.find(x => x.dataset.ano === sel.value) : null);
    const btImg = document.createElement('button');
    btImg.type = 'button';
    btImg.className = 'anos-img';
    btImg.textContent = '📷 Guardar imagem';
    btImg.title = 'Guardar a tabela à vista como imagem (PNG), para partilhar';
    acoes.append(caixa, btImg);
    grupo.hidden = blocos.length < 2;
    raiz.append(grupo, aviso, acoes);

    let atual = null;
    function atualizarURL() {
        const u = new URL(window.location.href);
        if (atual === emVigor) u.searchParams.delete('ano'); else u.searchParams.set('ano', atual.dataset.ano);
        if (sel.value) u.searchParams.set('comparar', sel.value); else u.searchParams.delete('comparar');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
    function mostrar(b, mudarURL) {
        atual = b;
        blocos.forEach(x => { x.hidden = x !== b; });
        grupo.querySelectorAll('button').forEach(bt => {
            const sim = bt.dataset.ano === b.dataset.ano;
            bt.classList.toggle('ativo', sim);
            bt.setAttribute('aria-pressed', sim ? 'true' : 'false');
        });
        // Aviso
        const e = estadoDe(b);
        const futuro = blocos.find(x => estadoDe(x) === 'futuro' && !pendente(x));
        const porPublicar = blocos.find(x => estadoDe(x) === 'futuro' && pendente(x));
        const ver = x => `<button type="button" data-ir="${x.dataset.ano}">Ver ${x.dataset.rotulo}</button>`;
        let html = '';
        if (pendente(b)) html = `Os valores de <strong>${b.dataset.rotulo}</strong> ainda não foram publicados (previstos para ${b.dataset.pendente}). ${ver(emVigor)}`;
        else if (e === 'vigor' && futuro) html = `Já são conhecidos os valores de <strong>${futuro.dataset.rotulo}</strong>, em vigor a partir de ${fmt(futuro.dataset.de)}. ${ver(futuro)}`;
        else if (e === 'vigor' && porPublicar) html = `Os valores de <strong>${porPublicar.dataset.rotulo}</strong> ainda não foram publicados (previstos para ${porPublicar.dataset.pendente}).`;
        else if (e === 'futuro') html = `Estes valores entram em vigor a <strong>${fmt(b.dataset.de)}</strong>. Até lá aplicam-se os de ${emVigor.dataset.rotulo}. ${ver(emVigor)}`;
        else if (e === 'passado') html = `Valores que já não estão em vigor (${textoEstado(b)}). ${ver(emVigor)}`;
        aviso.innerHTML = html;
        aviso.hidden = !html;
        aviso.classList.toggle('pendente', pendente(b));
        // Comparação (desligada por omissão; ao mudar de período, se estava ligada, compara com o anterior
        // a esse, ou com o mesmo de antes se ainda servir) e imagem
        const opcoes = anterioresDe(b);
        sel.innerHTML = '<option value="">— não comparar —</option>' +
            opcoes.map(a => `<option value="${a.dataset.ano}">${a.dataset.rotulo}</option>`).join('');
        sel.value = !alvo ? '' : (opcoes.some(a => a.dataset.ano === alvo) ? alvo : (opcoes[0] ? opcoes[0].dataset.ano : ''));
        alvo = sel.value;
        caixa.hidden = !opcoes.length;
        comparar(b, comparadoCom());
        btImg.hidden = pendente(b) || !b.querySelector('table');
        acoes.hidden = caixa.hidden && btImg.hidden;
        if (mudarURL) atualizarURL();
    }
    grupo.addEventListener('click', e => {
        const bt = e.target.closest('button');
        if (bt) mostrar(blocos.find(b => b.dataset.ano === bt.dataset.ano), true);
    });
    aviso.addEventListener('click', e => {
        const bt = e.target.closest('button[data-ir]');
        if (bt) mostrar(blocos.find(b => b.dataset.ano === bt.dataset.ir), true);
    });
    sel.addEventListener('change', () => { alvo = sel.value; comparar(atual, comparadoCom()); atualizarURL(); });
    btImg.addEventListener('click', guardarImagem);

    const pedido = new URLSearchParams(window.location.search).get('ano');
    mostrar(blocos.find(b => b.dataset.ano === pedido) || emVigor, false);
})();
