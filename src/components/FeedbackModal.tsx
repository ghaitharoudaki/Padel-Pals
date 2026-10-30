import React, { useState } from 'react';
import { MessageSquareHeart, Star, Send, X, CheckCircle2 } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const [rating, setRating] = useState(5);
  const [category, setCategory] = useState<'gameplay' | 'bug' | 'feature' | 'graphics'>('gameplay');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setComment('');
      onClose();
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-zinc-900 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
            <MessageSquareHeart className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-wide">Feedback & Bug Reports</h2>
            <p className="text-xs text-zinc-400 font-medium">Help us perfect Just Padel 3D physics & arcade mechanics</p>
          </div>
        </div>

        {submitted ? (
          <div className="py-12 flex flex-col items-center text-center space-y-3 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shadow-xl">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-white">Thank You for Your Feedback!</h3>
            <p className="text-xs text-zinc-400 max-w-xs">
              Your feedback helps shape tournament mechanics and upcoming character avatar outfits.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Rating Stars */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Overall Gameplay Experience
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 text-2xl transition hover:scale-110 active:scale-95"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        star <= rating ? 'text-amber-400 fill-current' : 'text-zinc-700'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Topic Category
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'gameplay', label: 'Physics/Pace' },
                  { id: 'bug', label: 'Bug / Glitch' },
                  { id: 'graphics', label: 'Characters/Court' },
                  { id: 'feature', label: 'New Modes' },
                ].map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id as any)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border ${
                      category === cat.id
                        ? 'bg-blue-600 text-white border-cyan-400/50 shadow-md shadow-blue-600/30'
                        : 'bg-zinc-800/80 text-zinc-400 border-white/5 hover:text-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment Area */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Your Thoughts or Bug Description
              </label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Let us know what you think about the glass bounces, avatars, or shot steering..."
                rows={4}
                className="w-full bg-zinc-800/90 border border-white/10 rounded-2xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 resize-none"
                required
              />
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-purple-600/30 transition flex items-center justify-center gap-2 active:scale-98"
              >
                <Send className="w-4 h-4" />
                Submit Feedback
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
