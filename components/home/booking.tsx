import { CalendarDays, Check, Clock, Dumbbell, GraduationCap, Briefcase, Scissors, Stethoscope, Wrench } from "lucide-react";
import { ExampleTag, h2, lede, section, wrap } from "./ui";
import { bookingPlan } from "@/lib/plans";

const USES = [
  { icon: Stethoscope, label: "Clinics and doctors" },
  { icon: Scissors, label: "Salons and spas" },
  { icon: Dumbbell, label: "Gyms and studios" },
  { icon: GraduationCap, label: "Tutors and coaching" },
  { icon: Briefcase, label: "Consultants and CAs" },
  { icon: Wrench, label: "Home services" },
];

const DAYS: { d: string; n: string; on?: boolean }[] = [
  { d: "Tue", n: "17" },
  { d: "Wed", n: "18", on: true },
  { d: "Thu", n: "19" },
  { d: "Fri", n: "20" },
  { d: "Sat", n: "21" },
];
const TIMES = ["10 am", "10:30 am", "11:30 am", "12 pm", "2 pm", "2:30 pm", "4 pm", "5:30 pm"];

/** Homepage section: appointment booking for service businesses. */
export function Booking() {
  const ticks = [
    "Your days, hours and lunch breaks, set in the dashboard",
    "Only real free times are shown, so no double bookings",
    "Holidays, leave and special hours for any date",
    "Every booking emailed to you, with one tap to WhatsApp",
  ];
  return (
    <section id="booking" className={`${section} bg-white`} aria-labelledby="booking-title">
      <div className={`${wrap} grid items-center gap-11 wlg:grid-cols-2 wlg:gap-16`}>
        <div className="wlg:order-2">
          <p className="mb-3.5 inline-block text-[13.5px] font-extrabold uppercase tracking-[0.14em] text-saffron">Appointment booking</p>
          <h2 id="booking-title" className={h2}>Patients and clients book a time, right in the chat</h2>
          <p className={`mt-4 ${lede}`}>
            “Is the doctor free tomorrow evening?” Botly answers with real open times, and the customer books in a few taps. Switch it on when you need it. On {bookingPlan().name} and above.
          </p>
          <ul className="mt-[26px] grid gap-3.5">
            {ticks.map((t) => (
              <li key={t} className="flex items-start gap-3 text-[16px] wsm:text-[17px]">
                <span className="mt-px grid h-7 w-7 flex-none place-items-center rounded-full bg-leaf-t text-leaf" aria-hidden>
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
          <ul className="mt-7 flex flex-wrap gap-2" aria-label="Made for">
            {USES.map((u) => (
              <li key={u.label} className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line bg-cream px-3.5 py-2 text-[14.5px] font-semibold">
                <u.icon className="h-4 w-4 text-saffron-d" aria-hidden /> {u.label}
              </li>
            ))}
          </ul>
        </div>
        <figure aria-label="Example booking in the chat widget" className="overflow-hidden rounded-[26px] border-2 border-ink bg-white shadow-[6px_6px_0_#0f766e] wsm:rounded-[32px] wsm:shadow-[10px_10px_0_#0f766e] wlg:order-1">
          <div className="flex items-center gap-3 border-b-[1.5px] border-line px-5 py-4 wsm:px-6 wsm:py-5">
            <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-[14px] bg-leaf-t text-leaf" aria-hidden>
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] text-ink-2">Sri Sai Clinic · chat</p>
              <p className="text-[18px] font-extrabold leading-[1.3]">General consultation</p>
            </div>
            <ExampleTag className="ml-auto" />
          </div>
          <div className="px-5 py-[18px] wsm:px-6" aria-hidden>
            <p className="mb-2.5 inline-flex items-center gap-1.5 text-[14px] text-ink-2">
              <Clock className="h-4 w-4" /> 20 min · ₹400
            </p>
            <div className="grid grid-cols-5 gap-2">
              {DAYS.map((x) => (
                <span key={x.n} className={`grid place-items-center rounded-[14px] border-[1.5px] py-2 text-center ${x.on ? "border-ink bg-ink text-white" : "border-line"}`}>
                  <span className="text-[12.5px] font-semibold opacity-80">{x.d}</span>
                  <span className="text-[18px] font-extrabold leading-tight">{x.n}</span>
                </span>
              ))}
            </div>
            <p className="mb-2 mt-4 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-2">Morning</p>
            <div className="grid grid-cols-4 gap-2">
              {TIMES.slice(0, 4).map((t, i) => (
                <span key={t} className={`whitespace-nowrap rounded-full border-[1.5px] py-2 text-center text-[13.5px] font-semibold wsm:text-[14.5px] ${i === 2 ? "border-leaf bg-leaf text-white" : "border-line"}`}>{t}</span>
              ))}
            </div>
            <p className="mb-2 mt-4 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-2">Afternoon</p>
            <div className="grid grid-cols-4 gap-2">
              {TIMES.slice(4).map((t) => (
                <span key={t} className="rounded-full border-[1.5px] border-line py-2 text-center text-[14.5px] font-semibold">{t}</span>
              ))}
            </div>
          </div>
          <div className="mx-5 mb-5 flex items-center gap-3 rounded-[18px] bg-cream px-[18px] py-3.5 text-[15.5px] wsm:mx-6 wsm:mb-6">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-leaf text-white" aria-hidden>
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <span>
              <strong>You&apos;re booked!</strong> Wed 18, 11:30 am
            </span>
          </div>
        </figure>
      </div>
    </section>
  );
}
