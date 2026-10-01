'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Sun, Moon, CloudRain, Leaf, Snowflake, Flower2,
  Clock, Calendar, AlarmClock,
  GlassWater, Dumbbell, Utensils,
  ListChecks, Target, Flag, Rocket, Lightbulb, Brain,
  BookOpen, GraduationCap,
  Users, User, Heart, Shield, Lock, Key,
  DollarSign, ChartLine, ChartPie, TrendingUp, TrendingDown,
  Search, Settings, Wrench, Hammer,
  Code, Database, Server, Cloud,
  Globe, Map, MapPin, Home, Building2, Briefcase,
  ShoppingCart, Truck, Plane, Car,
  Phone, Mail, MessageCircle, Camera, Music, Star, Award,
  CheckCircle, AlertTriangle, XCircle, HelpCircle,
  Layers, Puzzle, Zap, Recycle, Sprout,
} from 'lucide-react';

import type { VisualIconName } from '@/lib/ai/visualIcons';

/**
 * PATCH-237. Explicit name -> Lucide component map. No dynamic import, no
 * `icons` barrel: every name in VISUAL_ICON_NAMES has a component here.
 */
export const VISUAL_ICON_MAP: Record<VisualIconName, LucideIcon> = {
  sun: Sun,
  moon: Moon,
  'cloud-rain': CloudRain,
  leaf: Leaf,
  snowflake: Snowflake,
  'flower-2': Flower2,
  clock: Clock,
  calendar: Calendar,
  'alarm-clock': AlarmClock,
  'glass-water': GlassWater,
  dumbbell: Dumbbell,
  utensils: Utensils,
  'list-checks': ListChecks,
  target: Target,
  flag: Flag,
  rocket: Rocket,
  lightbulb: Lightbulb,
  brain: Brain,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  users: Users,
  user: User,
  heart: Heart,
  shield: Shield,
  lock: Lock,
  key: Key,
  'dollar-sign': DollarSign,
  'chart-line': ChartLine,
  'chart-pie': ChartPie,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  search: Search,
  settings: Settings,
  wrench: Wrench,
  hammer: Hammer,
  code: Code,
  database: Database,
  server: Server,
  cloud: Cloud,
  globe: Globe,
  map: Map,
  'map-pin': MapPin,
  home: Home,
  'building-2': Building2,
  briefcase: Briefcase,
  'shopping-cart': ShoppingCart,
  truck: Truck,
  plane: Plane,
  car: Car,
  phone: Phone,
  mail: Mail,
  'message-circle': MessageCircle,
  camera: Camera,
  music: Music,
  star: Star,
  award: Award,
  'check-circle': CheckCircle,
  'alert-triangle': AlertTriangle,
  'x-circle': XCircle,
  'help-circle': HelpCircle,
  layers: Layers,
  puzzle: Puzzle,
  zap: Zap,
  recycle: Recycle,
  sprout: Sprout,
};

export function getVisualIcon(name: string | undefined): LucideIcon | null {
  if (!name) return null;
  return (VISUAL_ICON_MAP as Record<string, LucideIcon>)[name] ?? null;
}
