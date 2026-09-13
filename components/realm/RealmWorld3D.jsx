'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { OFFICE_PORTALS } from '@/lib/realm-office-3d';
import styles from './realm-world-3d.module.css';

const initialHud = { ready: false, position: { x: 0, z: 8.5 }, nearest: null, labels: [], people: [], cameraMode: 'follow', quality: 'high', resolutionScale: 1, resolutionPreference: 'auto', sound: false };
function Glyph({ kind, ...props }) {
  const paths = { compass: <><circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/></>,
    map: <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z"/><path d="M9 3v16M15 5v16"/></>,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    tune: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></>,
    arrow: <path d="m8 5 7 7-7 7"/>, close: <path d="m6 6 12 12M18 6 6 18"/> };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[kind] || paths.compass}</svg>;
}
export default function RealmWorld3D(props) {
  const host = useRef(null), canvas = useRef(null), runtime = useRef(null), latest = useRef(props);
  const [hud, setHud] = useState(initialHud), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [placesOpen, setPlacesOpen] = useState(false), [helpOpen, setHelpOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const menuTrigger = useRef(null);
  const menuId = useId();
  latest.current = props;
  const places = Object.entries(OFFICE_PORTALS).filter(([, place]) => !props.allowedPanels || props.allowedPanels.includes(place.panel));
  const closeMenus = (returnFocus = false) => {
    setPlacesOpen(false); setQualityOpen(false); setHelpOpen(false);
    if (returnFocus) menuTrigger.current?.focus({ preventScroll: true });
  };
  const toggleMenu = (event, menu) => {
    menuTrigger.current = event.currentTarget;
    setPlacesOpen(menu === 'places' && !placesOpen);
    setQualityOpen(menu === 'quality' && !qualityOpen);
    setHelpOpen(menu === 'help' && !helpOpen);
  };
  useEffect(() => {
    let stopped = false;
    setError(''); setHud(initialHud);
    import('./three/officeRuntime.js').then(({ createOfficeRuntime }) => {
      if (stopped) return;
      runtime.current = createOfficeRuntime({ canvas: canvas.current, host: host.current, props: latest.current,
        onUpdate: update => { if (!stopped) setHud(previous => ({ ...previous, ...update })); },
        onError: message => { if (!stopped) setError(message); } });
    }).catch(error => {
      if (!stopped) {
        console.error('[Realm3D] initialization failed', error);
        setError('Thiết bị chưa khởi tạo được đồ họa 3D. Hãy thử tải lại hoặc mở chế độ tương thích.');
      }
    });
    return () => { stopped = true; runtime.current?.destroy(); runtime.current = null; };
  }, [attempt]);
  useEffect(() => { runtime.current?.updateProps(props); }, [props]);
  useEffect(() => {
    if (props.workspaceOpen) { setPlacesOpen(false); setQualityOpen(false); setHelpOpen(false); }
  }, [props.workspaceOpen]);
  const navigate = id => { runtime.current?.walkTo(id, true); setPlacesOpen(false); };
  const pad = (key, label, icon) => <button type="button" aria-label={label} className={styles.padButton}
    onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); runtime.current?.direction(key, true); }}
    onPointerUp={event => { runtime.current?.direction(key, false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => runtime.current?.direction(key, false)}
    onLostPointerCapture={() => runtime.current?.direction(key, false)}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); runtime.current?.direction(key, true); } }}
    onKeyUp={event => { if (event.key === 'Enter' || event.key === ' ') runtime.current?.direction(key, false); }}
    onBlur={() => runtime.current?.direction(key, false)}>{icon}</button>;
  return <div key={attempt} ref={host} className={styles.world} style={{ position: 'absolute', inset: 0, height: '100dvh', overflow: 'hidden' }} data-realm-world-version="3d" data-ready={hud.ready} data-camera={hud.cameraMode} data-quality={hud.quality} data-paused={props.workspaceOpen || undefined}
    onKeyDownCapture={event => { if (event.key === 'Escape' && (placesOpen || qualityOpen || helpOpen)) { event.preventDefault(); event.stopPropagation(); closeMenus(true); } }}>
    <canvas ref={canvas} className={styles.canvas} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} tabIndex={props.workspaceOpen ? -1 : 0}
      onPointerDown={() => closeMenus()}
      aria-label="Văn phòng Realm 3D. WASD hoặc phím mũi tên để đi, kéo chuột để xoay góc nhìn, E để tương tác." />
    {!props.workspaceOpen && <>
      <div className={styles.heading}>
        <div className={styles.eyebrow}><h2>Guildhall</h2>{props.demoMode && <span className={styles.demoBadge}>Dữ liệu mẫu</span>}</div>
        <div className={styles.location}><Glyph kind="compass"/><span>{hud.nearest?.name || 'Đại sảnh trung tâm'}</span></div>
        <p>{hud.cameraMode === 'first' ? 'Góc nhìn thứ nhất' : hud.cameraMode === 'overview' ? 'Toàn cảnh văn phòng' : 'Góc nhìn theo nhân vật'}</p>
      </div>
      <nav className={styles.tools} aria-label="Góc nhìn văn phòng">
        <button type="button" aria-label="Chọn địa điểm" title="Chọn địa điểm" aria-controls={menuId + '-places'} aria-expanded={placesOpen} onClick={event => toggleMenu(event, 'places')} className={placesOpen ? styles.toolActive : ''}><Glyph kind="map"/><span>Địa điểm</span></button>
        <button type="button" aria-label="Đổi góc nhìn nhân vật" title="Đổi góc nhìn nhân vật · C" aria-pressed={hud.cameraMode === 'first'} onClick={() => { closeMenus(); runtime.current?.changeCamera(hud.cameraMode === 'first' ? 'follow' : 'first'); }}><Glyph kind="eye"/><span>Góc nhìn</span></button>
        <button type="button" aria-label="Xem toàn cảnh" title="Xem toàn cảnh · M" aria-pressed={hud.cameraMode === 'overview'} onClick={() => { closeMenus(); runtime.current?.changeCamera(hud.cameraMode === 'overview' ? 'follow' : 'overview'); }}><Glyph kind="camera"/><span>Toàn cảnh</span></button>
        <button type="button" aria-label="Cài đặt đồ họa" title="Cài đặt đồ họa" aria-controls={menuId + '-quality'} aria-expanded={qualityOpen} onClick={event => toggleMenu(event, 'quality')}><Glyph kind="tune"/><span>Đồ họa</span></button>
      </nav>
      {qualityOpen && <section id={menuId + '-quality'} className={styles.qualityMenu} aria-label="Chất lượng đồ họa">
        <strong>Chọn chất lượng</strong>
        <button type="button" aria-pressed={hud.quality === 'balanced'} onClick={() => { runtime.current?.setQuality('balanced'); closeMenus(true); }}>Đồ họa nhẹ<small>Giảm tải cho thiết bị</small></button>
        <button type="button" aria-pressed={hud.quality === 'high'} onClick={() => { runtime.current?.setQuality('high'); closeMenus(true); }}>Đồ họa cao<small>Ánh sáng và chất liệu đầy đủ</small></button>
        <strong className={styles.resolutionTitle}>Độ nét</strong>
        <button type="button" aria-pressed={hud.resolutionPreference === 'auto'} onClick={() => runtime.current?.setResolutionPreference('auto')}>Tự điều chỉnh<small>Ưu tiên thao tác mượt trên thiết bị</small></button>
        <button type="button" aria-pressed={hud.resolutionPreference === 'clarity'} onClick={() => runtime.current?.setResolutionPreference('clarity')}>Ưu tiên độ nét<small>Ít giảm độ phân giải hơn; có thể giảm độ mượt</small></button>
        <p className={styles.resolutionNote}>Mức dựng hình: {Math.round(hud.resolutionScale * 100)}%<small>So với mức tối đa của chế độ hiện tại. Chất liệu và độ nét được điều chỉnh riêng.</small></p>
      </section>}
      {placesOpen && <section id={menuId + '-places'} className={styles.places} aria-label="Các khu vực làm việc">
        <div className={styles.placesHeader}><div><h3>Khu vực làm việc</h3><p>Chọn một nơi để đi tới và mở bàn làm việc.</p></div><button type="button" aria-label="Đóng địa điểm" onClick={() => closeMenus(true)}><Glyph kind="close"/></button></div>
        <div className={styles.mapCard} aria-hidden="true">
          <svg viewBox="-17 -13 34 26" className={styles.map}>
            <path d="M-15-11H15V11H-15Z" className={styles.mapFloor}/>
            <path d="M-5-11V-5H5V-11M-15-2H-8V7H-15M15-2H8V7H15M-4-2H4V2H-4Z" className={styles.mapWalls}/>
            {hud.people.map((person, index) => <circle key={person.id || index} cx={person.x} cy={person.z} r=".42" fill={person.color || '#859a95'}/>)}
            <circle cx={hud.position.x} cy={hud.position.z} r="1.05" fill="#dfc78e" opacity=".2"/>
            <circle cx={hud.position.x} cy={hud.position.z} r=".43" fill="#f8d591"/>
          </svg>
          <div><div className={styles.mapHeader}><Glyph kind="compass"/><span>Vị trí của bạn</span></div><strong>{hud.nearest?.name || 'Đại sảnh trung tâm'}</strong><span className={styles.mapFoot}>{props.demoMode ? 'Nhân vật mẫu' : hud.people.length + ' đồng đội trong kết nối hiện tại'}</span></div>
        </div>
        {places.map(([id, place], index) => <button key={id} type="button" onClick={() => navigate(id)}><span className={styles.placeNumber}>{String(index + 1).padStart(2, '0')}</span><span><strong>{place.name}</strong><small>{place.hint}</small></span><Glyph kind="arrow"/></button>)}
      </section>}
      <div className={styles.labels} aria-hidden="true">
        {hud.labels.filter(label => label.visible && label.y > 185 && label.y < (host.current?.clientHeight || 800) - 180 && label.x > 90 && label.x < (host.current?.clientWidth || 1440) - 90 && (hud.cameraMode === 'overview' || label.distance < 7)).map(label =>
          <div className={styles.landmark} key={label.id} style={{ transform: 'translate(' + label.x + 'px,' + label.y + 'px)' }}><i/><span>{label.name}</span></div>)}
      </div>
      <div className={styles.peopleLabels} aria-label="Đồng đội trong văn phòng">
        {hud.people.filter(person => person.visible && person.screenY > 95 && person.screenY < (host.current?.clientHeight || 800) - 135 && person.screenX > 75 && person.screenX < (host.current?.clientWidth || 1440) - 75).map(person =>
          <button type="button" key={person.id} className={styles.personLabel} style={{ left: person.screenX, top: person.screenY }} onClick={() => runtime.current?.selectPerson(person.id)} aria-label={'Mở hồ sơ ' + person.name}>
            <i style={{ background: person.status === 'dnd' ? '#b4897b' : person.color || '#91b59a' }}/>{person.name}
          </button>)}
      </div>
      {hud.nearest && <div className={styles.interaction}>
        <kbd className={styles.interactionKey}>E</kbd><div><strong>{hud.nearest.name}</strong><p>{hud.nearest.hint}</p></div>
        <button type="button" aria-label={'Mở ' + hud.nearest.name} onClick={() => { closeMenus(); runtime.current?.interact(); }}>Mở <Glyph kind="arrow"/></button>
      </div>}
      <div className={styles.pad} aria-label="Điều khiển di chuyển">{pad('w', 'Đi về phía trước', '↑')}<div>{pad('a', 'Đi sang trái', '←')}{pad('s', 'Đi lùi', '↓')}{pad('d', 'Đi sang phải', '→')}</div></div>
      <div className={styles.help}>
        <button type="button" onClick={event => toggleMenu(event, 'help')} aria-controls={menuId + '-help'} aria-expanded={helpOpen}><span>?</span>Điều khiển</button>
        {helpOpen && <section id={menuId + '-help'} className={styles.helpBody} aria-label="Hướng dẫn điều khiển"><h3>Di chuyển trong văn phòng</h3><p><kbd>W A S D</kbd> hoặc phím mũi tên để di chuyển.</p><p>Kéo để xoay góc nhìn. Cuộn để thay đổi khoảng cách.</p><p><kbd>E</kbd> mở khu vực gần bạn · <kbd>C</kbd> đổi góc nhìn · <kbd>M</kbd> toàn cảnh.</p><p>Nhấp mặt sàn để đi tới. Chọn Địa điểm để tự tìm đường.</p><button type="button" aria-pressed={hud.sound} onClick={() => runtime.current?.toggleAudio()}>{hud.sound ? 'Tắt âm thanh không gian' : 'Bật âm thanh không gian'}</button><button type="button" onClick={() => { closeMenus(); runtime.current?.resetCamera(); }}>Đặt lại góc nhìn</button></section>}
      </div>
    </>}
    {!hud.ready && !error && <div className={styles.loading} role="status"><div className={styles.loadingMark}/><span>Đang tải văn phòng</span><small>Chuẩn bị không gian 3D…</small></div>}
    {error && <div className={styles.failure} role="alert"><h3>Không gian 3D đang tạm ngắt</h3><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Thử lại</button><a href={props.demoMode ? '/realm-demo?world=v3' : '/realm?world=v3'}>Mở chế độ tương thích</a></div>}
    <span className={styles.srOnly} role="status" aria-live="polite">{hud.announcement || ''}</span>
  </div>;
}
