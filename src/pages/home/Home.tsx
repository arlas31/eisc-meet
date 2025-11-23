import Chat from "./chat/Chat";
import Interaction from "./interaction/Interaction";

const Home: React.FC = () => {
  return (
    <div className="flex w-full h-screen">
      {/* IZQUIERDA: VIDEO + BOTÓN */}
      <div className="w-2/3 flex flex-col p-4 gap-4">
        <Interaction />
      </div>

      {/* DERECHA: CHAT */}
      <div className="w-1/3 border-l border-gray-300 p-4">
        <Chat />
      </div>
    </div>
  );
};

export default Home;
