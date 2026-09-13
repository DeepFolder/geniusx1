import { ArrowRight, Zap, Target, Users, Lightbulb, Sparkles, Globe, Star, Eye, Compass, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { ThinkingIndicator } from "@/features/deepsearch/components/ThinkingIndicator";

const ABOUT_PROMPTS = [
  "Build an autonomous delivery drone with 3 kg payload, 30 min flight time...",
  "Search for surgical robotic arms with payload >5 kg, repeatability ±0.02 mm...",
  "Calculate required motor and gearbox for lifting 500 kg at 0.15 m/s...",
  "Find collaborative robots (cobots) with payload 10 kg, reach >1 m, safety-rated",
  "Compare hydraulic vs electric actuators for 25 kN load, stroke 300 mm...",
  "Design a conveyor system for fragile products, load 20 kg/unit, speed 0.3 m/s...",
];

function AboutSearchBar() {
  const [typed, setTyped] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef({ idx: 0, charIdx: 0, deleting: false });

  useEffect(() => {
    const clear = () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };

    const tick = () => {
      clear();
      const s = stateRef.current;
      const cur = ABOUT_PROMPTS[s.idx];
      if (!s.deleting) {
        if (s.charIdx < cur.length) {
          s.charIdx++;
          setTyped(cur.slice(0, s.charIdx));
          timeoutRef.current = setTimeout(tick, 26);
        } else {
          timeoutRef.current = setTimeout(() => { s.deleting = true; tick(); }, 1200);
        }
      } else {
        if (s.charIdx > 0) {
          s.charIdx--;
          setTyped(cur.slice(0, s.charIdx));
          timeoutRef.current = setTimeout(tick, 16);
        } else {
          s.deleting = false;
          s.idx = (s.idx + 1) % ABOUT_PROMPTS.length;
          timeoutRef.current = setTimeout(tick, 0);
        }
      }
    };

    tick();
    return clear;
  }, []);

  return (
    <div className="relative w-full">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-700/20 via-purple-700/20 to-purple-600/20 rounded-xl blur-lg scale-105 pointer-events-none" />
      <div className="relative p-[1px] rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg shadow-blue-500/20">
        <div className="flex items-center gap-3 bg-black/90 rounded-xl px-4 py-3">
          <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="text-sm text-gray-400 leading-snug min-h-[1.25rem] flex-1">
            {typed}<span className="inline-block w-px h-3.5 bg-blue-400 ml-px align-middle animate-pulse" />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function About() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    setIsVisible(true);
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="min-h-screen bg-black overflow-hidden relative">
      {/* Animated Background */}
      <div className="fixed inset-0 z-0">
        {/* Gradient Mesh */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-cyan-900/20"></div>
        
        {/* Moving Particles */}
        <div className="absolute inset-0">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-0.5 h-0.5 bg-white/3 rounded-full animate-float"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 8}s`,
                animationDuration: `${5 + Math.random() * 6}s`
              }}
            />
          ))}
        </div>

        {/* Interactive Cursor Effect */}
        <div 
          className="absolute w-64 h-64 bg-gradient-to-r from-cyan-500/5 to-purple-500/5 rounded-full blur-3xl transition-all duration-500 ease-out pointer-events-none"
          style={{
            left: mousePosition.x - 128,
            top: mousePosition.y - 128,
          }}
        />
      </div>

      {/* Hero Section */}
      <section className="relative z-10 min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div className={`transition-all duration-1000 ${isVisible ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}`}>
            <div className="space-y-8">
              <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 rounded-full border border-cyan-500/20 backdrop-blur-sm">
                <Sparkles className="w-4 h-4 text-cyan-400 mr-2" />
                <span className="text-cyan-400 text-sm font-medium">AI-Powered Innovation</span>
              </div>
              
              <h1 className="text-6xl lg:text-7xl font-bold bg-gradient-to-r from-white via-cyan-200 to-purple-200 bg-clip-text text-transparent leading-tight">
                Meet
                <br />
                <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                  DeepFolder
                </span>
              </h1>
              
              <h2 className="text-2xl lg:text-3xl text-gray-300 font-light">
                The Future of Product Intelligence
              </h2>
              
              <p className="text-xl text-gray-400 leading-relaxed max-w-lg">
                Where AI transforms fragmented product data into intelligent discovery, understanding, and system design.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <a href="/">
                  <Button className="group bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white px-8 py-4 text-lg rounded-2xl transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/25">
                    Explore Platform
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </a>
              </div>
            </div>
          </div>

          {/* Right Visual */}
          <div className={`relative transition-all duration-1000 delay-300 ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
            <div className="flex flex-col items-center justify-center gap-6 p-8 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm">
              {/* Thinking Indicator */}
              <ThinkingIndicator />

              {/* Divider */}
              <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

              {/* Typing Search Bar */}
              <AboutSearchBar />
            </div>
          </div>
        </div>
      </section>

      {/* Mission / Vision / Purpose Section */}
      <section className="relative z-10 py-24 lg:py-32 bg-gradient-to-b from-black via-gray-950 to-black">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 rounded-full border border-cyan-500/20 backdrop-blur-sm mb-6">
              <Sparkles className="w-4 h-4 text-cyan-400 mr-2" />
              <span className="text-cyan-400 text-sm font-medium">Mission · Vision · Purpose</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-white via-cyan-200 to-purple-200 bg-clip-text text-transparent mb-4">
              What We Stand For
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {[
              {
                icon: Target,
                label: "Mission",
                copy: "To organize and transform unstructured product data into instantly accessible, intelligent, and useful knowledge.",
                gradient: "from-cyan-500 to-blue-600",
                testId: "card-mission",
              },
              {
                icon: Eye,
                label: "Vision",
                copy: "To become the global AI infrastructure for product intelligence — empowering people and machines to discover, connect, and innovate faster than ever.",
                gradient: "from-purple-500 to-blue-600",
                testId: "card-vision",
              },
              {
                icon: Compass,
                label: "Purpose",
                copy: "To make global product knowledge usable, connected, and accessible for everyone.",
                gradient: "from-blue-500 to-purple-600",
                testId: "card-purpose",
              },
            ].map((item) => (
              <div
                key={item.label}
                data-testid={item.testId}
                className="group relative bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-3xl p-8 lg:p-10 transition-all duration-500 hover:border-gray-700 hover:bg-gray-900/70"
              >
                <div className={`absolute -inset-4 bg-gradient-to-r ${item.gradient} rounded-3xl opacity-0 group-hover:opacity-10 blur-2xl transition-all duration-500 pointer-events-none`}></div>
                <div className="relative">
                  <div className={`w-14 h-14 mb-6 bg-gradient-to-r ${item.gradient} rounded-2xl flex items-center justify-center shadow-lg`}>
                    <item.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">{item.label}</h3>
                  <p className="text-gray-400 leading-relaxed text-base lg:text-lg">{item.copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="relative py-32 bg-gradient-to-b from-black to-gray-900">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-500/10 to-cyan-500/10 rounded-full border border-purple-500/20 backdrop-blur-sm mb-8">
              <Star className="w-4 h-4 text-purple-400 mr-2" />
              <span className="text-purple-400 text-sm font-medium">Core Values</span>
            </div>
            <h2 className="text-5xl lg:text-6xl font-bold bg-gradient-to-r from-white via-purple-200 to-cyan-200 bg-clip-text text-transparent mb-6">
              What Drives Us
            </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              The fundamental principles that shape every decision and innovation at DeepFolder
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: Lightbulb,
                title: "Innovation",
                description: "Pioneering AI-driven solutions that transform how businesses discover and connect with manufacturing partners.",
                gradient: "from-cyan-500 to-blue-600",
                glowColor: "cyan-500"
              },
              {
                icon: Target,
                title: "Excellence",
                description: "Delivering exceptional quality in every interaction, ensuring precision and reliability in all our services.",
                gradient: "from-purple-500 to-pink-600",
                glowColor: "purple-500"
              },
              {
                icon: Users,
                title: "Collaboration",
                description: "Building bridges between businesses, fostering partnerships that drive mutual growth and success.",
                gradient: "from-green-500 to-emerald-600",
                glowColor: "green-500"
              },
              {
                icon: Zap,
                title: "Intelligence",
                description: "Leveraging advanced AI to provide smart insights, recommendations, and automation for better decisions.",
                gradient: "from-orange-500 to-red-600",
                glowColor: "orange-500"
              }
            ].map((value, index) => (
              <div
                key={value.title}
                className="group relative"
                style={{ animationDelay: `${index * 200}ms` }}
              >
                {/* Glow Effect */}
                <div className={`absolute -inset-4 bg-gradient-to-r ${value.gradient} rounded-3xl opacity-0 group-hover:opacity-20 blur-xl transition-all duration-500`}></div>
                
                {/* Card */}
                <div className="relative bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-3xl p-8 h-full transition-all duration-500 group-hover:border-gray-700 group-hover:transform group-hover:scale-105 group-hover:shadow-2xl">
                  {/* Icon */}
                  <div className={`w-20 h-20 mx-auto mb-6 bg-gradient-to-r ${value.gradient} rounded-2xl flex items-center justify-center transform transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 shadow-lg group-hover:shadow-${value.glowColor}/50`}>
                    <value.icon className="w-10 h-10 text-white" />
                  </div>
                  
                  {/* Content */}
                  <h3 className="text-2xl font-bold text-white mb-4 text-center">
                    {value.title}
                  </h3>
                  <p className="text-gray-400 leading-relaxed text-center">
                    {value.description}
                  </p>
                  
                  {/* Animated Border */}
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="relative py-32 bg-gradient-to-b from-gray-900 to-black overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[300px] bg-cyan-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-full border border-cyan-500/20 backdrop-blur-sm mb-8">
            <Globe className="w-4 h-4 text-cyan-400 mr-2" />
            <span className="text-cyan-400 text-sm font-medium tracking-wide">Contact</span>
          </div>

          <h2 className="text-5xl lg:text-6xl font-bold bg-gradient-to-r from-white via-cyan-200 to-blue-200 bg-clip-text text-transparent mb-5">
            Get in Touch
          </h2>
          <p className="text-lg text-gray-400 max-w-xl mx-auto mb-16">
            Have a question or want to learn more? We'd love to hear from you.
          </p>

          {/* Contact cards */}
          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Location */}
            <div className="group relative">
              <div className="absolute -inset-px bg-gradient-to-r from-cyan-500/30 to-blue-500/30 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />
              <div className="relative bg-gray-900/60 backdrop-blur-sm border border-gray-800 group-hover:border-cyan-500/40 rounded-2xl p-8 transition-all duration-300">
                <div className="w-14 h-14 mx-auto mb-5 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Globe className="w-7 h-7 text-cyan-400" />
                </div>
                <p className="text-xs text-cyan-400 uppercase tracking-widest font-medium mb-2">Location</p>
                <p className="text-white text-lg font-semibold">Zurich, Switzerland</p>
              </div>
            </div>

            {/* Email */}
            <div className="group relative">
              <div className="absolute -inset-px bg-gradient-to-r from-purple-500/30 to-pink-500/30 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />
              <div className="relative bg-gray-900/60 backdrop-blur-sm border border-gray-800 group-hover:border-purple-500/40 rounded-2xl p-8 transition-all duration-300">
                <div className="w-14 h-14 mx-auto mb-5 bg-gradient-to-br from-purple-500/20 to-pink-600/20 border border-purple-500/30 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Zap className="w-7 h-7 text-purple-400" />
                </div>
                <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-2">Email</p>
                <a
                  href="mailto:info@deepfolder.ai"
                  className="text-white text-lg font-semibold hover:text-cyan-400 transition-colors duration-200"
                >
                  info@deepfolder.ai
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
