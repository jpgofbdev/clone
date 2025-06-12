
    const map = L.map('map',{zoomControl:false}).setView([46.6,2.5],6);
    Gp.Services.getConfig({
      apiKey:"essentiels",
      onSuccess:config=>{
        const osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(map);
        const ortho=L.geoportalLayer.WMTS({layer:"ORTHOIMAGERY.ORTHOPHOTOS"});
        const plan=L.geoportalLayer.WMTS({layer:"GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2"});
        L.control.layers({OSM:osm,Ortho:ortho,Plan:plan},null,{position:'bottomleft'}).addTo(map);
        addSearchControl();
      }
    });

    const colors={0:'#FFD700',1:'#1f78b4',2:'#33a02c',3:'#e31a1c',4:'#ff7f00',5:'#6a3d9a'};
    const activeRangs=new Set([0]);
    let dptPolygons, allMaillesData, fullData, mailleLayer, subdivLayer;
    const dptLayer=L.geoJSON(null,{style:{color:'#33cc33',weight:2,fillColor:'#33cc33',fillOpacity:0.05}}).addTo(map);
    const visibleLabels=L.layerGroup().addTo(map);

    fetch('geojson/dpt_4326_simplif100.geojson').then(r=>r.json()).then(data=>{
      dptPolygons=data;
      const sel=document.getElementById('departementSelect');
      data.features.sort((a,b)=>a.properties.nom_m.localeCompare(b.properties.nom_m))
        .forEach(f=>{
          const o=document.createElement('option');
          o.value=f.properties.insee_dep;
          o.text=`${f.properties.nom_m} (${f.properties.insee_dep})`;
          sel.appendChild(o);
        });
    });

    fetch('geojson/remplacantes_label.geojson').then(r=>r.json()).then(data=>{ allMaillesData = data;
      fullData=data;
      const cb=document.getElementById('checkboxes');
      
        const lbl=document.createElement('label');
        lbl.innerHTML = `<div class="color-box" style="background:${colors[0]}"></div>
<input type="checkbox" value="0" checked onchange="applyFilters()"/>maille initiale`;
        document.getElementById('checkboxes').appendChild(lbl);

    });

    function addSearchControl(){
      const SearchControl=L.Control.extend({
        options:{position:'bottomleft'},
        onAdd:()=>{const div=L.DomUtil.create('div','leaflet-control-search');
          div.innerHTML='<input id="searchCommune" list="suggestions" placeholder="Commune" autocomplete="off"/><datalist id="suggestions"></datalist>';
          L.DomEvent.disableClickPropagation(div);
          return div;
        }
      });
      map.addControl(new SearchControl());
      const input=document.getElementById('searchCommune');
      const dl=document.getElementById('suggestions');
      input.addEventListener('input',()=>{
        const v=input.value; if(v.length<3) return;
        fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(v)}&type=municipality`)
          .then(r=>r.json()).then(data=>{
            dl.innerHTML=''; data.features.forEach(f=>{
              const opt=document.createElement('option');
              opt.value=f.properties.name;
              opt.dataset.lat=f.geometry.coordinates[1];
              opt.dataset.lon=f.geometry.coordinates[0];
              dl.appendChild(opt);
            });
          });
      });
      input.addEventListener('change',()=>{
        const val=input.value;
        Array.from(dl.options).forEach(opt=>{if(opt.value===val)map.setView([opt.dataset.lat,opt.dataset.lon],12);});
      });
    }

    function onDeptChange(code){
      if(!code) return;
      zoomToDepartement(code);
      showMaillesForDept(code);
      document.getElementById('reloadButton').style.display='inline-block';
      document.getElementById('departementSelect').disabled=true;
      document.getElementById('geolocateBtn').disabled=true;
      const lf=document.getElementById('labelFilterSelect');
      lf.style.display='inline-block';
      lf.innerHTML='<option value="">Filtrer par N° maille</option>';
      // remplir avec les préfixes disponibles
      const prefixes=[...new Set(fullData.features.map(f=>f.properties.label_dsb.split('_')[0]))]
        .sort((a,b)=>a-b);
      prefixes.forEach(p=>{
        const o=document.createElement('option');
        o.value=p; o.text=p; lf.appendChild(o);
      });
      document.getElementById('subdivideBtn').style.display='inline-block';
    }

    function applyFilters(){
      const lf=document.getElementById('labelFilterSelect').value;
      activeRangs.clear();
      document.querySelectorAll('#checkboxes input').forEach(cb=>{ if(cb.checked) activeRangs.add(+cb.value); });
      if(mailleLayer) map.removeLayer(mailleLayer);
      visibleLabels.clearLayers();
      const filtered=fullData.features.filter(f=>{
        const prefix=f.properties.label_dsb.split('_')[0];
        if(lf && prefix!==lf) return false;
        return (f.properties.rang_sourc||0) === 0;
      });
      mailleLayer=L.geoJSON(filtered,{
        style:f=>({color:colors[f.properties.rang_sourc||0]||'#999',weight:1,fillOpacity:0.4}),
        onEachFeature:(f,layer)=>{const c=layer.getBounds().getCenter();
          L.marker(c,{icon:L.divIcon({className:'label-rang',html:f.properties.label_dsb,iconSize:[16,16]})})
            .addTo(visibleLabels);
          layer.bindPopup(`<b>${f.properties.CODE_1KM}</b><br/>Rang: ${f.properties.rang_sourc||0}`);
        }
      }).addTo(map);
    }

    function zoomToDepartement(code){
      const feat=dptPolygons.features.find(f=>f.properties.insee_dep==code);
      if(feat){dptLayer.clearLayers().addData(feat);map.fitBounds(L.geoJSON(feat).getBounds());}
    }

    function showMaillesForDept(code){
      
      const deptFeatures = allMaillesData.features.filter(f=>f.properties.ID_DEPT==code);
      fullData = {...allMaillesData, features: deptFeatures};
    
      applyFilters();
    }

    function toggleSubMailles(){
      const btn=document.getElementById('subdivideBtn');
      if(subdivLayer){ map.removeLayer(subdivLayer); subdivLayer=null; btn.textContent='Afficher sous-mailles'; return; }
      fetch('geojson/mailles_250.geojson').then(r=>r.json()).then(data=>{
        const codes=new Set(fullData.features.map(f=>f.properties.CODE_1KM));
        subdivLayer=L.geoJSON(data.features.filter(f=>codes.has(f.properties.code_1km)),{
          style:{color:'#1f78b4',weight:1,fillOpacity:0.2},
          onEachFeature:(f,layer)=>{const n=parseInt(f.properties.rang_tirag.slice(1),10);
            const c=layer.getBounds().getCenter();
            L.marker(c,{icon:L.divIcon({className:'label-tirag',html:n,iconSize:[12,12],style:'font-weight:'+(1000-(n-1)*60)})})
              .addTo(map);
          }
        }).addTo(map);
        btn.textContent='Masquer sous-mailles';
      });
    }

    function geolocate(){
      navigator.geolocation.getCurrentPosition(pos=>{
        const pt=turf.point([pos.coords.longitude,pos.coords.latitude]);
        const cont=dptPolygons.features.find(f=>turf.booleanPointInPolygon(pt,f));
        if(cont){document.getElementById('departementSelect').value=cont.properties.insee_dep; onDeptChange(cont.properties.insee_dep);}
        L.circleMarker([pos.coords.latitude,pos.coords.longitude],{radius:6,color:'red'}).addTo(map)
          .bindPopup('Vous êtes ici').openPopup();
      },()=>alert('Géolocalisation impossible'));
    }

    function showInstallInstructions(){
      alert("Pour ajouter Maill'haie à votre écran d'accueil, utilisez le menu du navigateur et sélectionnez 'Ajouter à l'écran d'accueil'.");
    }
  