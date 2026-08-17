const features = [
  ["Character Bible", "Store identity descriptions and multiple reference angles."],
  ["Shot Control", "Shot size, lens, angle, movement, lighting and action per shot."],
  ["Continuity", "Reuse approved references, seeds and prior frames across scenes."],
  ["Model Routing", "Seedance 2.5, Veo 3.1 Fast and Grok Imagine 1.5."],
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="eyebrow">Telegram production backend</div>
        <h1>AI Movie Studio</h1>
        <p>
          Build a movie as projects, characters, scenes and controlled shots. Telegram is the team interface;
          Firebase keeps continuity; fal.ai renders each approved shot.
        </p>
        <div className="grid">
          {features.map(([title, text]) => (
            <div className="card" key={title}><strong>{title}</strong><span>{text}</span></div>
          ))}
        </div>
        <p>Health endpoint: <code>/api/health</code></p>
      </section>
    </main>
  );
}
