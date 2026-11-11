import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Star, Camera, X, Loader2, CheckCircle2 } from 'lucide-react';

interface ReviewFormProps {
  adminId: string;
  branchId?: string | null;
  primaryColor?: string;
  shopName?: string;
  onClose?: () => void;
}

export const CustomerReviewForm = ({
  adminId,
  branchId,
  primaryColor,
  shopName,
  onClose,
}: ReviewFormProps) => {
  const color = primaryColor || '#ea580c';
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Photo too large', description: 'Max 5 MB', variant: 'destructive' });
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({ title: 'Please select a star rating', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      let photoUrl: string | null = null;

      // Upload photo if provided
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() || 'jpg';
        const fileName = `${adminId}/${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('review-photos')
          .upload(fileName, photoFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from('review-photos')
          .getPublicUrl(uploadData.path);
        photoUrl = urlData.publicUrl;
      }

      const { error } = await (supabase as any).from('customer_reviews').insert({
        admin_id: adminId,
        branch_id: branchId || null,
        customer_name: name.trim() || null,
        rating,
        review_text: text.trim() || null,
        photo_url: photoUrl,
        is_approved: false,
      });

      if (error) throw error;
      setSubmitted(true);
      toast({ title: '🙏 Thank you!', description: 'Your review has been submitted.' });
      setTimeout(() => onClose?.(), 3000);
    } catch (err) {
      console.error('Review submit error:', err);
      toast({ title: 'Error submitting review', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <CheckCircle2 className="w-12 h-12" style={{ color }} />
        <p className="font-bold text-lg text-gray-800 dark:text-white">Review Submitted!</p>
        <p className="text-sm text-gray-500 text-center">
          Thank you for your feedback. It helps us serve you better!
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">Rate your experience at</p>
        <h3 className="font-black text-lg text-gray-900 dark:text-white mt-0.5">
          {shopName || 'our restaurant'}
        </h3>
      </div>

      {/* Star rating */}
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map(s => (
          <button
            key={s}
            onMouseEnter={() => setHoverRating(s)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(s)}
            className="transition-transform hover:scale-110 active:scale-95"
          >
            <Star
              className="w-9 h-9"
              style={{
                color: s <= (hoverRating || rating) ? '#f59e0b' : '#d1d5db',
                fill: s <= (hoverRating || rating) ? '#f59e0b' : 'transparent',
              }}
            />
          </button>
        ))}
      </div>

      {rating > 0 && (
        <p className="text-center text-sm font-semibold text-amber-600">
          {['', '😕 Poor', '😐 Fair', '😊 Good', '😄 Great', '🤩 Excellent!'][rating]}
        </p>
      )}

      {/* Name */}
      <div>
        <Label className="text-xs mb-1 block">Your Name (optional)</Label>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Happy Customer"
          className="text-sm"
        />
      </div>

      {/* Review text */}
      <div>
        <Label className="text-xs mb-1 block">What did you enjoy? (optional)</Label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="The biryani was amazing! Great service..."
          rows={3}
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 dark:border-zinc-700"
          style={{ borderColor: color }}
        />
      </div>

      {/* Photo upload */}
      <div>
        <Label className="text-xs mb-1 block">Add a food photo (optional)</Label>
        {photoPreview ? (
          <div className="relative w-24 h-24 rounded-xl overflow-hidden border">
            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
            <button
              onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
              className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed text-sm text-gray-500 dark:border-zinc-700 hover:border-gray-400 transition-colors"
          >
            <Camera className="w-4 h-4" />
            Upload photo
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting || rating === 0}
        className="w-full h-12 rounded-2xl text-white font-bold text-base transition-all active:scale-[0.98] disabled:opacity-50 !bg-transparent"
        style={{
          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
          boxShadow: `0 6px 18px -4px ${color}50`,
        }}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
          </span>
        ) : 'Submit Review'}
      </button>
    </div>
  );
};
